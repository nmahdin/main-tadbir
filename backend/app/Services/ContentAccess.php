<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Role grants remain global. Department membership grants ordinary access only. */
final class ContentAccess
{
    public function departmentIds(User $actor): array
    {
        if (! $actor->isActive() || ! $actor->role?->is_active) {
            return [];
        }
        // Per HTTP request only; a new request rechecks revoked memberships.
        $key = 'content_member_departments_'.$actor->id;
        if (! request()->attributes->has($key)) {
            request()->attributes->set($key, Department::forMember($actor)->where('status', 'active')->pluck('id')->map(fn ($id) => (string) $id)->all());
        }

        return request()->attributes->get($key);
    }

    public function canEnter(User $actor): bool
    {
        return $actor->hasPermission('content.view') || $this->departmentIds($actor) !== [];
    }

    public function scopeDepartments(Builder $query, User $actor): Builder
    {
        $ids = $this->departmentIds($actor);

        return $query->where(function (Builder $q) use ($ids): void {
            $q->whereRaw('1=0');
            foreach ($ids as $id) {
                $q->orWhere('payload->departmentId', $id)->orWhere('payload->departmentId', (int) $id)
                    ->orWhereJsonContains('payload->departmentIds', $id)
                    ->orWhereJsonContains('payload->departmentIds', (int) $id);
            }
        });
    }

    public function visibleTo(User $actor): Builder
    {
        $query = Content::query();

        return $actor->hasPermission('content.view') ? $query : $this->scopeDepartments($query, $actor);
    }

    public function departmentMember(User $actor, Content $content): bool
    {
        $ids = array_filter([($content->payload['departmentId'] ?? null), ...($content->payload['departmentIds'] ?? [])], 'is_scalar');

        return array_intersect(array_map('strval', $ids), $this->departmentIds($actor)) !== [];
    }

    public function canView(User $actor, Content $content): bool
    {
        return $actor->hasPermission('content.view') || $this->departmentMember($actor, $content);
    }

    public function canEdit(User $actor, Content $content): bool
    {
        return $actor->hasPermission('content.edit') || $this->departmentMember($actor, $content);
    }

    public function guardEdit(User $actor, Content $content, array $input): void
    {
        abort_unless($this->canEdit($actor, $content), 403);
        if ($actor->hasPermission('content.edit')) {
            return;
        }
        // Ordinary membership is not authority to reassign access/ownership.
        $old = [...($content->payload ?? []), 'ownerId' => $content->owner_id, 'projectId' => $content->project_id];
        $normalize = fn ($value) => is_array($value) ? array_map('strval', $value) : ($value === null || $value === '' ? null : (string) $value);
        foreach (['departmentId', 'departmentIds', 'ownerId', 'creatorId', 'editorIds', 'reviewerIds', 'approverId', 'projectId'] as $field) {
            if (array_key_exists($field, $input)) {
                abort_unless($normalize($input[$field]) === $normalize($old[$field] ?? (is_array($input[$field]) ? [] : null)), 403, 'عضویت دپارتمان مجوز تغییر دامنهٔ دسترسی محتوا نیست.');
            }
        }
    }
}
