<?php

namespace App\Services\Access;

use App\Models\DomainRecord;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/** Membership is mandatory, including for global moderators and administrators. */
final class ChatAccess
{
    public function conversations(User $actor): Builder
    {
        return DomainRecord::where('domain', DomainRecord::DOMAIN_CONVERSATION)
            ->where(function (Builder $query) use ($actor): void {
                // Legacy payloads contain both string and numeric identifiers.
                $query->whereJsonContains('payload->memberIds', (string) $actor->id)
                    ->orWhereJsonContains('payload->memberIds', (int) $actor->id);
            });
    }

    public function scope(Builder $query, User $actor, string $domain): void
    {
        if ($domain === DomainRecord::DOMAIN_CONVERSATION) {
            $query->whereIn('id', $this->conversations($actor)->select('id'));
        } elseif ($domain === DomainRecord::DOMAIN_CHAT_MESSAGE) {
            $query->whereIn('parent_id', $this->conversations($actor)->select('id'));
        }
    }

    public function conversation(User $actor, int $id, bool $lock = false): DomainRecord
    {
        $query = $this->conversations($actor)->whereKey($id);
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->firstOrFail();
    }

    public function manages(User $actor, DomainRecord $conversation): bool
    {
        if ((int) $conversation->user_id === (int) $actor->id || $actor->hasPermission('messaging.manage_group')) {
            return true;
        }
        foreach ($conversation->payload['members'] ?? [] as $member) {
            if ((string) ($member['userId'] ?? '') === (string) $actor->id && ($member['role'] ?? '') === 'admin') {
                return true;
            }
        }

        return false;
    }

    public function authorize(User $actor, DomainRecord $record, string $action): DomainRecord
    {
        $conversation = $this->conversation($actor,
            $record->domain === DomainRecord::DOMAIN_CONVERSATION ? $record->id : (int) $record->parent_id,
            $action !== 'view');
        if ($action === 'view') {
            return $conversation;
        }
        $manager = $this->manages($actor, $conversation);
        if ($record->domain === DomainRecord::DOMAIN_CONVERSATION) {
            abort_unless($manager, 403);
        } elseif ($action === 'edit') {
            abort_unless((int) $record->user_id === (int) $actor->id, 403, 'ویرایش متن فقط توسط نویسنده مجاز است.');
        } else {
            $delete = $conversation->payload['deletePermission'] ?? 'authors_and_admins';
            $author = (int) $record->user_id === (int) $actor->id;
            abort_unless($manager || $actor->hasPermission('messaging.delete_message')
                || $delete === 'all' || ($author && $delete !== 'admins_only'), 403);
        }

        return $conversation;
    }

    public function createAttributes(User $actor, string $domain, array $data): array
    {
        if ($domain === DomainRecord::DOMAIN_CONVERSATION) {
            abort_unless($actor->hasPermission('messaging.create_chat'), 403);
            $payload = $this->conversationPayload($data);
            $payload['memberIds'] = array_values(array_unique([...$payload['memberIds'], (string) $actor->id]));
            abort_if($payload['type'] === 'direct' && count($payload['memberIds']) !== 2, 422, 'گفتگوی مستقیم باید دو عضو داشته باشد.');
            $payload['members'] = $this->members($payload, $actor->id);
            $parentId = null;
        } else {
            abort_unless($actor->hasPermission('messaging.send_message'), 403);
            $payload = Validator::make($data, [
                'conversationId' => ['required', 'integer'],
                'text' => ['present', 'nullable', 'string', 'max:10000'],
                'attachments' => ['sometimes', 'array', 'max:20'],
                'attachments.*' => ['array'],
                'attachments.*.id' => ['required', 'uuid', 'distinct'],
                'attachments.*.name' => ['required', 'string', 'max:255'],
                'attachments.*.size' => ['required', 'integer', 'min:0', 'max:20971520'],
                'attachments.*.sizeFormatted' => ['required', 'string', 'max:40'],
                'attachments.*.type' => ['required', Rule::in(['image', 'video', 'audio', 'document', 'voice', 'archive'])],
                'attachments.*.duration' => ['sometimes', 'nullable', 'string', 'max:20'],
                'replyToMessageId' => ['sometimes', 'nullable', 'integer'],
                'taskRef' => ['sometimes', 'nullable', 'array'],
                'taskRef.taskId' => ['required_with:taskRef', 'integer'],
                'taskRef.title' => ['required_with:taskRef', 'string', 'max:255'],
                'taskRef.status' => ['required_with:taskRef', 'string', 'max:80'],
                'taskRef.priority' => ['required_with:taskRef', 'string', 'max:40'],
                'projectRef' => ['sometimes', 'nullable', 'array'],
                'projectRef.projectId' => ['required_with:projectRef', 'integer'],
                'projectRef.name' => ['required_with:projectRef', 'string', 'max:255'],
                'projectRef.color' => ['required_with:projectRef', 'string', 'max:20'],
                'projectRef.status' => ['required_with:projectRef', 'string', 'max:80'],
                'projectRef.progress' => ['required_with:projectRef', 'numeric', 'min:0', 'max:100'],
                'mentions' => ['sometimes', 'array', 'max:100'],
                'mentions.*' => ['integer', 'distinct'],
            ])->validate();
            $payload['text'] = (string) ($payload['text'] ?? '');
            $conversation = $this->conversation($actor, (int) $payload['conversationId'], true);
            abort_if(($conversation->payload['writePermission'] ?? 'all') === 'admins_only' && ! $this->manages($actor, $conversation), 403);
            $parentId = $conversation->id;
            if (! empty($payload['replyToMessageId'])) {
                abort_unless(DomainRecord::where('domain', DomainRecord::DOMAIN_CHAT_MESSAGE)
                    ->where('parent_id', $parentId)->whereKey($payload['replyToMessageId'])->exists(), 422);
            }
            if (! empty($payload['attachments'])) {
                $payload['attachments'] = collect($payload['attachments'])->map(function (array $attachment) use ($parentId): array {
                    $token = (string) $attachment['id'];
                    $path = collect(Storage::disk('local')->files('chat/'.$parentId))
                        ->first(fn (string $candidate) => pathinfo($candidate, PATHINFO_FILENAME) === $token);
                    abort_unless($path, 422, 'پیوست باید پیش از ارسال در همین گفتگو بارگذاری شده باشد.');
                    $size = (int) Storage::disk('local')->size($path);

                    return [
                        'id' => $token,
                        'name' => $attachment['name'],
                        'size' => $size,
                        'sizeFormatted' => $size >= 1048576 ? round($size / 1048576, 1).' MB' : max(1, (int) round($size / 1024)).' KB',
                        'type' => $attachment['type'],
                        'duration' => $attachment['duration'] ?? null,
                        'url' => url('/api/v1/chat/conversations/'.$parentId.'/attachments/'.$token),
                    ];
                })->all();
            }
            $payload = [...$payload, 'conversationId' => (string) $parentId,
                'senderId' => (string) $actor->id, 'deliveryStatus' => 'sent',
                'timestamp' => now()->toIso8601String(), 'reactions' => []];
            $conversationPayload = $conversation->payload ?? [];
            $conversationPayload['lastMessage'] = [
                'text' => trim((string) ($payload['text'] ?? '')) ?: (! empty($payload['attachments']) ? '[پیوست]' : (! empty($payload['taskRef']) ? '[ارجاع به وظیفه]' : '[پیام]')),
                'timestamp' => $payload['timestamp'],
                'senderId' => (string) $actor->id,
                'senderName' => $actor->name,
            ];
            $conversationPayload['updatedAt'] = $payload['timestamp'];
            $conversation->update(['payload' => $conversationPayload]);
        }
        $payload['createdAt'] = now()->toIso8601String();

        return ['domain' => $domain, 'user_id' => $actor->id, 'parent_id' => $parentId, 'payload' => $payload];
    }

    public function updatePayload(User $actor, DomainRecord $record, array $data): array
    {
        $before = $record->payload ?? [];
        $command = $data['command'] ?? null;
        if ($command !== null) {
            Validator::make($data, [
                'command' => ['required', Rule::in(['toggle_reaction', 'toggle_pin', 'toggle_star', 'toggle_mute', 'mark_read', 'mark_unread'])],
                'emoji' => ['required_if:command,toggle_reaction', 'nullable', 'string', 'max:16'],
            ])->validate();
            $conversation = $this->authorize($actor, $record, 'view');
            if ($record->domain === DomainRecord::DOMAIN_CHAT_MESSAGE) {
                if ($command === 'toggle_reaction') {
                    $emoji = trim((string) $data['emoji']);
                    abort_if($emoji === '', 422, 'واکنش معتبر نیست.');
                    $reactions = collect($before['reactions'] ?? [])->filter(fn ($reaction) => is_array($reaction) && ! empty($reaction['emoji']))->keyBy('emoji');
                    $reaction = $reactions->get($emoji, ['emoji' => $emoji, 'userIds' => []]);
                    $reactionUsers = is_array($reaction['userIds'] ?? null) ? $reaction['userIds'] : [];
                    $ids = array_values(array_unique(array_map('strval', $reactionUsers)));
                    $actorId = (string) $actor->id;
                    $ids = in_array($actorId, $ids, true) ? array_values(array_diff($ids, [$actorId])) : [...$ids, $actorId];
                    if ($ids === []) {
                        $reactions->forget($emoji);
                    } else {
                        $reactions->put($emoji, ['emoji' => $emoji, 'count' => count($ids), 'userIds' => $ids]);
                    }
                    $before['reactions'] = $reactions->values()->all();
                } elseif ($command === 'toggle_pin') {
                    abort_unless($this->manages($actor, $conversation) || $actor->hasPermission('messaging.pin_message'), 403);
                    $before['isPinned'] = ! (bool) ($before['isPinned'] ?? false);
                } elseif ($command === 'toggle_star') {
                    $starredBy = is_array($before['starredBy'] ?? null) ? $before['starredBy'] : [];
                    $ids = array_values(array_unique(array_map('strval', $starredBy)));
                    $actorId = (string) $actor->id;
                    $before['starredBy'] = in_array($actorId, $ids, true) ? array_values(array_diff($ids, [$actorId])) : [...$ids, $actorId];
                } else {
                    abort(422, 'این فرمان برای پیام معتبر نیست.');
                }

                return $before;
            }
            abort_unless(in_array($command, ['toggle_mute', 'mark_read', 'mark_unread'], true), 422, 'این فرمان برای گفتگو معتبر نیست.');
            $actorId = (string) $actor->id;
            if ($command === 'toggle_mute') {
                $mutedBy = is_array($before['mutedBy'] ?? null) ? $before['mutedBy'] : [];
                $ids = array_values(array_unique(array_map('strval', $mutedBy)));
                $before['mutedBy'] = in_array($actorId, $ids, true) ? array_values(array_diff($ids, [$actorId])) : [...$ids, $actorId];
            } else {
                $readAt = is_array($before['readAtBy'] ?? null) ? $before['readAtBy'] : [];
                $readAt[$actorId] = $command === 'mark_read' ? now()->toIso8601String() : now()->subYears(100)->toIso8601String();
                $before['readAtBy'] = $readAt;
            }

            return $before;
        }

        $this->authorize($actor, $record, 'edit');
        $allowed = $record->domain === DomainRecord::DOMAIN_CONVERSATION
            ? ['name', 'description', 'avatar', 'color', 'memberIds', 'members', 'writePermission', 'deletePermission', 'isArchived']
            : ['text'];
        // Old clients send whole records. Accept unchanged metadata, never mutate
        // author/parent/read receipts/reaction aggregates through the generic PUT.
        foreach (Arr::except($data, ['id', 'createdAt', 'updatedAt', 'isMuted', 'unreadCount', 'isStarred']) as $key => $value) {
            if (! in_array($key, $allowed, true)) {
                abort_if($value !== ($before[$key] ?? null), 403, 'این فیلد از مسیر ویرایش عمومی قابل تغییر نیست.');
            }
        }
        if ($record->domain === DomainRecord::DOMAIN_CHAT_MESSAGE) {
            $patch = Validator::make($data, ['text' => ['sometimes', 'string', 'max:10000']])->validate();

            return [...$before, ...$patch, 'isEdited' => true, 'editedAt' => now()->toIso8601String()];
        }
        $payload = $this->conversationPayload([...$before, ...Arr::only($data, $allowed)]);
        abort_unless(in_array((string) $record->user_id, $payload['memberIds'], true), 422, 'سازنده گفتگو باید عضو باقی بماند.');
        if (($before['type'] ?? '') === 'direct') {
            $old = array_map('strval', $before['memberIds'] ?? []);
            sort($old);
            $new = $payload['memberIds'];
            sort($new);
            abort_if($old !== $new, 403, 'اعضای گفتگوی خصوصی قابل تغییر نیستند.');
        }
        $payload['members'] = $this->members($payload, $record->user_id);

        return [...$before, ...$payload];
    }

    private function conversationPayload(array $data): array
    {
        $payload = Validator::make($data, [
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['direct', 'group', 'channel'])],
            'memberIds' => ['required', 'array', 'min:1', 'max:200'],
            'memberIds.*' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'members' => ['sometimes', 'array', 'max:200'],
            'members.*.userId' => ['required', 'integer'],
            'members.*.role' => ['required', Rule::in(['owner', 'admin', 'member'])],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'description' => ['sometimes', 'nullable', 'string', 'max:3000'],
            'avatar' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
            'writePermission' => ['sometimes', Rule::in(['all', 'admins_only'])],
            'deletePermission' => ['sometimes', Rule::in(['authors_and_admins', 'admins_only', 'all'])],
            'isArchived' => ['sometimes', 'boolean'],
            'isMuted' => ['sometimes', 'boolean'],
        ])->validate();
        $payload['memberIds'] = array_map('strval', $payload['memberIds']);

        return $payload;
    }

    private function members(array $payload, int $owner): array
    {
        $submitted = collect($payload['members'] ?? [])->keyBy('userId');

        return array_map(fn ($id) => ['userId' => $id,
            'role' => (string) $owner === $id ? 'owner' : (($submitted[$id]['role'] ?? '') === 'admin' ? 'admin' : 'member'),
            'joinedAt' => now()->toIso8601String()], $payload['memberIds']);
    }
}
