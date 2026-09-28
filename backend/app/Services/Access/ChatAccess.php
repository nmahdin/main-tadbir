<?php

namespace App\Services\Access;

use App\Models\DomainRecord;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
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
                'text' => ['present', 'string', 'max:10000'],
                'attachments' => ['sometimes', 'array', 'max:20'],
                'replyToMessageId' => ['sometimes', 'nullable', 'integer'],
                'taskRef' => ['sometimes', 'nullable', 'array'],
                'projectRef' => ['sometimes', 'nullable', 'array'],
                'mentions' => ['sometimes', 'array'],
            ])->validate();
            $conversation = $this->conversation($actor, (int) $payload['conversationId'], true);
            abort_if(($conversation->payload['writePermission'] ?? 'all') === 'admins_only' && ! $this->manages($actor, $conversation), 403);
            $parentId = $conversation->id;
            if (! empty($payload['replyToMessageId'])) {
                abort_unless(DomainRecord::where('domain', DomainRecord::DOMAIN_CHAT_MESSAGE)
                    ->where('parent_id', $parentId)->whereKey($payload['replyToMessageId'])->exists(), 422);
            }
            $payload = [...$payload, 'conversationId' => (string) $parentId,
                'senderId' => (string) $actor->id, 'deliveryStatus' => 'sent',
                'timestamp' => now()->toIso8601String(), 'reactions' => []];
        }
        $payload['createdAt'] = now()->toIso8601String();

        return ['domain' => $domain, 'user_id' => $actor->id, 'parent_id' => $parentId, 'payload' => $payload];
    }

    public function updatePayload(User $actor, DomainRecord $record, array $data): array
    {
        $this->authorize($actor, $record, 'edit');
        $before = $record->payload ?? [];
        $allowed = $record->domain === DomainRecord::DOMAIN_CONVERSATION
            ? ['name', 'description', 'avatar', 'color', 'memberIds', 'members', 'writePermission', 'deletePermission', 'isArchived']
            : ['text'];
        // Old clients send whole records. Accept unchanged metadata, never mutate
        // author/parent/read receipts/reaction aggregates through the generic PUT.
        foreach (Arr::except($data, ['id', 'createdAt', 'updatedAt']) as $key => $value) {
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
