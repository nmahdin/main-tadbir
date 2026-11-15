<?php

namespace App\Core\Messaging;

use App\Core\Audit\AuditWriter;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SystemMessageService
{
    public function __construct(private readonly AuditWriter $audit)
    {
    }

    /**
     * Create a new draft (or new version of an existing slug). Passing
     * an existing $slug with $bumpVersion=true creates a new version;
     * acknowledgment is required per version (immutable prior evidence).
     *
     * @param array{title:string,body_markdown:string,audience:string,ack_required?:bool,ack_policy_version?:string|null,cta_label?:string,cta_link?:string|null,category?:string|null,bump_version?:bool} $payload
     */
    public function draft(User $actor, string $slug, array $payload, ?Organization $organization = null): CoreSystemMessage
    {
        $audience = SystemMessageAudience::from($payload['audience']);
        if ($audience === SystemMessageAudience::Organization && ! $organization) {
            throw new \InvalidArgumentException('Organization audience requires an organization.');
        }

        return DB::transaction(function () use ($actor, $slug, $payload, $audience, $organization): CoreSystemMessage {
            $version = 1;
            if ($payload['bump_version'] ?? true) {
                $latest = CoreSystemMessage::query()->where('slug', $slug)->max('version');
                if ($latest) {
                    $version = (int) $latest + 1;
                }
            }

            $msg = new CoreSystemMessage();
            $msg->fill([
                'slug' => $slug,
                'version' => $version,
                'audience' => $audience->value,
                'organization_id' => $organization?->id,
                'title' => mb_substr((string) $payload['title'], 0, 200),
                'body_markdown' => (string) $payload['body_markdown'],
                'cta_label' => mb_substr((string) ($payload['cta_label'] ?? 'Learn more'), 0, 120),
                'cta_link' => isset($payload['cta_link']) ? CoreSystemMessage::safeCtaLink((string) $payload['cta_link']) : null,
                'category' => isset($payload['category']) ? mb_substr((string) $payload['category'], 0, 60) : null,
                'status' => 'draft',
                'ack_required' => (bool) ($payload['ack_required'] ?? false),
                'ack_policy_version' => $payload['ack_policy_version'] ?? null,
                'published_at' => null,
                'retired_at' => null,
                'published_by_user_id' => $actor->id,
            ]);
            $msg->save();

            $this->audit->record($actor, 'system_message.draft', ['message_id' => (int) $msg->id, 'slug' => $slug, 'version' => $version]);

            return $msg;
        });
    }

    public function publish(User $actor, CoreSystemMessage $msg, ?CarbonImmutable $at = null): CoreSystemMessage
    {
        if ($msg->status !== 'draft') {
            throw new \DomainException('Only draft messages can be published.');
        }
        $at ??= CarbonImmutable::now('UTC');

        return DB::transaction(function () use ($actor, $msg, $at): CoreSystemMessage {
            $msg->forceFill([
                'status' => 'published',
                'published_at' => $at,
                'retired_at' => null,
            ])->save();

            $this->audit->record($actor, 'system_message.publish', [
                'message_id' => (int) $msg->id,
                'slug' => $msg->slug,
                'version' => $msg->version,
            ]);

            return $msg;
        });
    }

    public function retire(User $actor, CoreSystemMessage $msg, ?CarbonImmutable $at = null): CoreSystemMessage
    {
        if (! $msg->isPublished()) {
            throw new \DomainException('Only published messages can be retired.');
        }
        $at ??= CarbonImmutable::now('UTC');

        return DB::transaction(function () use ($actor, $msg, $at): CoreSystemMessage {
            $msg->forceFill(['status' => 'retired', 'retired_at' => $at])->save();
            $this->audit->record($actor, 'system_message.retire', ['message_id' => (int) $msg->id]);
            return $msg;
        });
    }

    /**
     * Idempotently ensure a delivery row exists for an eligible user.
     * Called from (a) message publish sweep (b) first page load of
     * the consumer inbox endpoint for each user. Does NOT overwrite
     * existing ack evidence.
     */
    public function ensureDelivery(CoreSystemMessage $msg, User $user, ?CarbonImmutable $at = null): ?CoreSystemMessageDelivery
    {
        if (! $msg->isPublished()) {
            return null;
        }
        if (! $this->userEligibleForMessage($msg, $user)) {
            return null;
        }
        $at ??= CarbonImmutable::now('UTC');

        try {
            $delivery = CoreSystemMessageDelivery::query()->create([
                'message_id' => $msg->id,
                'version' => $msg->version,
                'user_id' => $user->id,
                'organization_id' => $msg->organization_id,
                'first_delivered_at' => $at,
            ]);
        } catch (UniqueConstraintViolationException) {
            /** @var CoreSystemMessageDelivery $delivery */
            $delivery = CoreSystemMessageDelivery::query()
                ->where('message_id', $msg->id)
                ->where('version', $msg->version)
                ->where('user_id', $user->id)
                ->first();
        }

        return $delivery;
    }

    public function markRead(CoreSystemMessageDelivery $delivery, ?CarbonImmutable $at = null): CoreSystemMessageDelivery
    {
        $at ??= CarbonImmutable::now('UTC');
        if ($delivery->read_at === null) {
            $delivery->forceFill(['read_at' => $at])->save();
        }
        return $delivery;
    }

    /**
     * Record acknowledgment. Idempotent — if ack is already present,
     * the existing immutable evidence is returned unchanged.
     */
    public function acknowledge(User $actor, CoreSystemMessageDelivery $delivery, ?CarbonImmutable $at = null): CoreSystemMessageDelivery
    {
        $at ??= CarbonImmutable::now('UTC');
        if ($delivery->acknowledged_at !== null) {
            return $delivery; // immutable evidence preserved
        }

        return DB::transaction(function () use ($actor, $delivery, $at): CoreSystemMessageDelivery {
            // Re-read with lock to avoid races with concurrent acks
            /** @var CoreSystemMessageDelivery $fresh */
            $fresh = CoreSystemMessageDelivery::query()
                ->whereKey($delivery->id)
                ->lockForUpdate()
                ->first();
            if ($fresh->acknowledged_at !== null) {
                return $fresh;
            }

            $hash = hash('sha256', implode('|', [
                (string) $fresh->message_id,
                (string) $fresh->version,
                (string) $actor->id,
                $at->toIso8601String(),
                (string) $fresh->organization_id,
            ]));

            $fresh->forceFill([
                'acknowledged_at' => $at,
                'ack_evidence_hash' => $hash,
            ])->save();

            $this->audit->record($actor, 'system_message.acknowledge', [
                'message_id' => (int) $fresh->message_id,
                'version' => (int) $fresh->version,
                'hash' => $hash,
            ]);

            return $fresh;
        });
    }

    /**
     * Enumerate deliveries currently pending ack for a user (for the
     * mandatory-ack modal on login).
     */
    public function pendingAcksForUser(User $user)
    {
        return CoreSystemMessageDelivery::query()
            ->where('user_id', $user->id)
            ->whereNull('acknowledged_at')
            ->whereHas('message', fn ($q) => $q
                ->where('ack_required', true)
                ->where('status', 'published'))
            ->with('message')
            ->get();
    }

    /**
     * Inbox listing for a consumer (with eligibility resolved).
     */
    public function inboxForUser(User $user, ?bool $unreadOnly = false, int $perPage = 20)
    {
        $eligibleMessageIds = CoreSystemMessage::query()
            ->where('status', 'published')
            ->where(function ($root) use ($user): void {
                $root->where('audience', SystemMessageAudience::Platform->value);
                $root->orWhere(function ($personal) use ($user): void {
                    $personal->where('audience', SystemMessageAudience::Personal->value)
                        ->whereHas('deliveries', fn ($d) => $d->where('user_id', $user->id));
                });
                $orgIds = OrganizationMembership::query()
                    ->where('user_id', $user->id)
                    ->where('status', \App\Core\Memberships\MembershipStatus::Active->value)
                    ->pluck('organization_id');
                $root->orWhere(function ($org) use ($orgIds): void {
                    $org->where('audience', SystemMessageAudience::Organization->value)
                        ->whereIn('organization_id', $orgIds);
                });
            })
            ->pluck('id');

        // Lazily ensure deliveries exist for any eligible messages the
        // user hasn't been provisioned for yet.
        $missing = CoreSystemMessage::query()
            ->whereIn('id', $eligibleMessageIds)
            ->whereNotExists(function ($d) use ($user): void {
                $d->selectRaw('1')
                    ->from('core_system_message_deliveries')
                    ->whereColumn('core_system_message_deliveries.message_id', 'core_system_messages.id')
                    ->where('core_system_message_deliveries.user_id', $user->id);
            })
            ->get();
        $now = CarbonImmutable::now('UTC');
        foreach ($missing as $m) {
            $this->ensureDelivery($m, $user, $now);
        }

        $query = CoreSystemMessageDelivery::query()
            ->where('user_id', $user->id)
            ->with('message')
            ->whereHas('message', fn ($q) => $q->where('status', 'published'))
            ->orderByDesc('first_delivered_at');

        if ($unreadOnly) {
            $query->unread();
        }

        return $query->paginate($perPage);
    }

    private function userEligibleForMessage(CoreSystemMessage $msg, User $user): bool
    {
        return match ($msg->audience) {
            SystemMessageAudience::Platform->value => true,
            SystemMessageAudience::Personal->value => (bool) CoreSystemMessageDelivery::query()
                ->where('message_id', $msg->id)
                ->where('user_id', $user->id)
                ->exists(),
            SystemMessageAudience::Organization->value => $msg->organization_id !== null
                && OrganizationMembership::query()
                    ->where('organization_id', $msg->organization_id)
                    ->where('user_id', $user->id)
                    ->where('status', \App\Core\Memberships\MembershipStatus::Active->value)
                    ->exists(),
            default => false,
        };
    }
}
