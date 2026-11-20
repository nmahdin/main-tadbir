<?php

namespace App\Core\Support;

use App\Core\Audit\AuditWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * State-machine-driven service for the platform support queue.
 * Organization membership alone NEVER grants ticket access; requesters
 * see only their own tickets unless they hold platform.support.*
 * permissions.
 */
final class SupportTicketService
{
    public const ALLOWED_CATEGORIES = ['billing', 'account', 'technical', 'feature_request', 'other'];
    // 10 MB per file.
    public const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
    public const MAX_ATTACHMENTS_PER_MESSAGE = 6;

    public function __construct(
        private readonly AuditWriter $audit,
        private readonly FilesystemFactory $filesystem,
    ) {}

    // ---- Creation ---------------------------------------------------

    /**
     * @param array{subject:string,category:string,body:string,priority?:string} $payload
     * @param array<int,UploadedFile> $attachments
     */
    public function openTicket(User $requester, array $payload, array $attachments = []): CoreSupportTicket
    {
        $category = in_array($payload['category'] ?? 'other', self::ALLOWED_CATEGORIES, true)
            ? $payload['category']
            : 'other';
        $priority = SupportTicketPriority::from($payload['priority'] ?? SupportTicketPriority::NORMAL->value);

        if (count($attachments) > self::MAX_ATTACHMENTS_PER_MESSAGE) {
            throw new \InvalidArgumentException('Too many attachments.');
        }

        return DB::transaction(function () use ($requester, $payload, $attachments, $category, $priority): CoreSupportTicket {
            $reference = $this->generateReference();

            $ticket = new CoreSupportTicket();
            $ticket->fill([
                'reference' => $reference,
                'subject' => mb_substr((string) $payload['subject'], 0, 200),
                'category' => $category,
                'status' => SupportTicketStatus::NEW->value,
                'priority' => $priority->value,
                'owner_user_id' => $requester->id,
                'organization_id' => null,
                'last_replied_at' => CarbonImmutable::now('UTC'),
            ]);
            $ticket->save();

            $message = $this->addMessage($ticket, $requester, 'requester', (string) $payload['body'], false, $attachments);

            $this->recordActivity($ticket, $requester, 'ticket.created', [
                'reference' => $reference,
                'category' => $category,
            ]);

            $this->audit->record($requester, 'support.ticket.create', [
                'ticket_id' => (int) $ticket->id,
                'reference' => $reference,
            ]);

            return $ticket->load(['messages']);
        });
    }

    // ---- Replies / notes -------------------------------------------

    public function addReply(CoreSupportTicket $ticket, User $actor, string $body, bool $internalNote, array $attachments = []): CoreSupportMessage
    {
        $this->assertCanReply($ticket, $actor, $internalNote);
        if (count($attachments) > self::MAX_ATTACHMENTS_PER_MESSAGE) {
            throw new \InvalidArgumentException('Too many attachments.');
        }

        return DB::transaction(function () use ($ticket, $actor, $body, $internalNote, $attachments): CoreSupportMessage {
            if (! $internalNote) {
                // A user-visible reply from either side flips status.
                $isAgent = $this->isSupportAgent($actor);
                if ($isAgent && in_array($ticket->status, [SupportTicketStatus::NEW->value, SupportTicketStatus::OPEN->value, SupportTicketStatus::PENDING_REPLY->value], true)) {
                    $ticket->forceFill(['status' => SupportTicketStatus::PENDING_USER->value]);
                } elseif (! $isAgent && $ticket->status === SupportTicketStatus::PENDING_USER->value) {
                    $ticket->forceFill(['status' => SupportTicketStatus::PENDING_REPLY->value]);
                }
                $ticket->forceFill(['last_replied_at' => CarbonImmutable::now('UTC')]);
                $ticket->save();
            }

            $message = $this->addMessage($ticket, $actor, $this->roleForActor($ticket, $actor), $body, $internalNote, $attachments);

            $this->recordActivity($ticket, $actor, $internalNote ? 'ticket.internal_note' : 'ticket.reply', [
                'message_id' => (int) $message->id,
            ]);

            return $message;
        });
    }

    // ---- Status / assignment ---------------------------------------

    public function transitionStatus(CoreSupportTicket $ticket, User $actor, SupportTicketStatus $target): CoreSupportTicket
    {
        $this->assertSupportAgent($actor);
        if (! $ticket->canTransitionTo($target)) {
            throw new \DomainException("Invalid transition from {$ticket->status} to {$target->value}.");
        }

        return DB::transaction(function () use ($ticket, $actor, $target): CoreSupportTicket {
            $previous = $ticket->status;
            $now = CarbonImmutable::now('UTC');
            $ticket->forceFill([
                'status' => $target->value,
                'resolved_at' => $target === SupportTicketStatus::RESOLVED ? $now : $ticket->resolved_at,
                'closed_at' => $target === SupportTicketStatus::CLOSED ? $now : $ticket->closed_at,
            ])->save();

            $this->recordActivity($ticket, $actor, 'ticket.status_change', ['from' => $previous, 'to' => $target->value]);
            $this->audit->record($actor, 'support.ticket.status', [
                'ticket_id' => (int) $ticket->id,
                'from' => $previous,
                'to' => $target->value,
            ]);
            return $ticket;
        });
    }

    public function assign(CoreSupportTicket $ticket, User $actor, ?User $agent): CoreSupportTicket
    {
        $this->assertSupportAgent($actor);
        if ($agent !== null && ! $this->isSupportAgent($agent)) {
            throw new \InvalidArgumentException('Assignee must hold platform.support.agent.');
        }

        return DB::transaction(function () use ($ticket, $actor, $agent): CoreSupportTicket {
            $from = $ticket->assigned_user_id;
            $ticket->forceFill(['assigned_user_id' => $agent?->id])->save();
            if ($ticket->status === SupportTicketStatus::NEW->value) {
                $ticket->forceFill(['status' => SupportTicketStatus::OPEN->value])->save();
            }
            $this->recordActivity($ticket, $actor, 'ticket.assignment', [
                'from_user_id' => $from,
                'to_user_id' => $agent?->id,
            ]);
            return $ticket;
        });
    }

    // ---- Authorization helpers -------------------------------------

    public function assertCanView(CoreSupportTicket $ticket, User $user): void
    {
        if ($ticket->isOwner($user)) {
            return;
        }
        $this->assertSupportAgent($user);
    }

    public function assertCanReply(CoreSupportTicket $ticket, User $actor, bool $internalNote): void
    {
        if ($internalNote) {
            $this->assertSupportAgent($actor);
            return;
        }
        if (! $ticket->isOwner($actor)) {
            $this->assertSupportAgent($actor);
        }
    }

    public function assertSupportAgent(User $user): void
    {
        if (! $this->isSupportAgent($user)) {
            throw new \DomainException('Support agent permission required.');
        }
    }

    public function isSupportAgent(User $user): bool
    {
        /** @var \App\Core\Platform\PlatformAuthorizer $auth */
        $auth = app(\App\Core\Platform\PlatformAuthorizer::class);
        return $auth->allows($user, 'platform.support.manage')
            || $auth->allows($user, 'platform.support.agent');
    }

    // ---- Attachments download --------------------------------------

    public function streamAttachment(CoreSupportAttachment $attachment, User $user): StreamedResponse
    {
        $ticket = $attachment->ticket;
        $this->assertCanView($ticket, $user);

        $disk = $this->filesystem->disk($attachment->storage_disk);
        if (! $disk->exists($attachment->storage_path)) {
            abort(404);
        }

        // Touch accessed_at (non-destructive).
        $attachment->forceFill(['accessed_at' => CarbonImmutable::now('UTC')])->save();

        return $disk->download($attachment->storage_path, $attachment->original_name, [
            'Content-Type' => $attachment->mime_type,
        ]);
    }

    public function findAttachmentByToken(string $token): ?CoreSupportAttachment
    {
        return CoreSupportAttachment::query()->where('access_token', $token)->first();
    }

    // ---- Internals -------------------------------------------------

    private function addMessage(
        CoreSupportTicket $ticket,
        User $actor,
        string $role,
        string $body,
        bool $internalNote,
        array $attachments,
    ): CoreSupportMessage {
        $storedAttachmentMeta = [];
        $disk = $this->filesystem->disk('local');

        foreach ($attachments as $file) {
            if (! $file instanceof UploadedFile || ! $file->isValid()) {
                throw new \InvalidArgumentException('Invalid attachment.');
            }
            if ($file->getSize() > self::MAX_ATTACHMENT_BYTES) {
                throw new \InvalidArgumentException('Attachment exceeds 10MB limit.');
            }
            $path = $file->storeAs(
                'support/'.$ticket->reference,
                (string) Str::uuid().'-'.$file->getClientOriginalName(),
                ['disk' => 'local'],
            );

            $att = new CoreSupportAttachment();
            $att->fill([
                'ticket_id' => $ticket->id,
                'uploader_user_id' => $actor->id,
                'storage_disk' => 'local',
                'storage_path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => (string) $file->getMimeType(),
                'size_bytes' => (int) $file->getSize(),
                'access_token' => Str::random(64),
            ]);
            $att->save();

            $storedAttachmentMeta[] = [
                'attachment_id' => (int) $att->id,
                'name' => $att->original_name,
                'access_token' => $att->access_token,
            ];
        }

        $msg = new CoreSupportMessage();
        $msg->fill([
            'ticket_id' => $ticket->id,
            'author_user_id' => $actor->id,
            'author_role' => $role,
            'body' => $body,
            'internal_note' => $internalNote,
            'attachments' => $storedAttachmentMeta ?: null,
        ]);
        $msg->save();

        return $msg;
    }

    private function recordActivity(CoreSupportTicket $ticket, User $actor, string $event, ?array $payload): void
    {
        $activity = new CoreSupportActivity();
        $activity->fill([
            'ticket_id' => $ticket->id,
            'actor_user_id' => $actor->id,
            'event_type' => $event,
            'payload' => $payload,
        ]);
        $activity->save();
    }

    private function roleForActor(CoreSupportTicket $ticket, User $actor): string
    {
        if ($ticket->isOwner($actor)) {
            return 'requester';
        }
        return $this->isSupportAgent($actor) ? 'agent' : 'system';
    }

    private function generateReference(): string
    {
        $prefix = 'TAD';
        $ym = CarbonImmutable::now('UTC')->format('Ym');
        // Allocate the next NNNNN scoped by month. Loop handles rare collision.
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $prefixRef = "{$prefix}-{$ym}-";
            $last = (int) DB::table('core_support_tickets')
                ->where('reference', 'like', $prefixRef.'%')
                ->lockForUpdate()
                ->max(DB::raw('CAST(SUBSTRING(reference, '. (strlen($prefixRef)+1) .') AS UNSIGNED)'));
            $next = str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT);
            $candidate = $prefixRef.$next;
            if (! CoreSupportTicket::query()->where('reference', $candidate)->exists()) {
                return $candidate;
            }
        }
        throw new \RuntimeException('Could not allocate a unique support reference.');
    }
}
