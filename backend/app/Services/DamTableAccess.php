<?php

namespace App\Services;

use App\Bot\Bale\Support\OperationsSchema;
use App\Models\Content;
use App\Models\DamDataTable;
use App\Models\Project;
use App\Models\User;

final class DamTableAccess
{
    /** @var array<int, array<int>> project_id => member user ids */
    private array $projectMembersCache = [];

    /** @var array<int, array<int>> content_id => related user ids */
    private array $contentUsersCache = [];

    /**
     * نرمال‌سازی grants با سازگاری عقب‌رو:
     * جدید {type, id, access} — قدیم {user_id, access}.
     *
     * @return array<int, array{type: string, id: int|string, access: string}>
     */
    private function grantsOf(DamDataTable $table): array
    {
        $grants = $table->grants;
        if (is_string($grants)) {
            $grants = json_decode($grants, true);
        }
        if (! is_array($grants)) {
            return [];
        }

        $normalized = [];
        foreach ($grants as $grant) {
            if (! is_array($grant)) {
                continue;
            }
            if (isset($grant['user_id'])) {
                $normalized[] = ['type' => 'user', 'id' => (int) $grant['user_id'], 'access' => $grant['access'] ?? 'view'];
            } elseif (isset($grant['type'], $grant['id'])) {
                $normalized[] = [
                    'type' => (string) $grant['type'],
                    'id' => is_numeric($grant['id']) ? (int) $grant['id'] : (string) $grant['id'],
                    'access' => $grant['access'] ?? 'view',
                ];
            }
        }

        return $normalized;
    }

    private function projectUserIds(int $projectId): array
    {
        if (! array_key_exists($projectId, $this->projectMembersCache)) {
            $project = Project::query()->with('members:id')->find($projectId);
            $ids = [];
            if ($project) {
                if ($project->project_manager_id) {
                    $ids[] = (int) $project->project_manager_id;
                }
                foreach ($project->members as $member) {
                    $ids[] = (int) $member->id;
                }
            }
            $this->projectMembersCache[$projectId] = array_unique($ids);
        }

        return $this->projectMembersCache[$projectId];
    }

    private function contentUserIds(int $contentId): array
    {
        if (! array_key_exists($contentId, $this->contentUsersCache)) {
            $content = Content::query()->find($contentId);
            $ids = [];
            if ($content) {
                if ($content->owner_id) {
                    $ids[] = (int) $content->owner_id;
                }
                $payload = $content->payload ?? [];
                foreach (['creatorIds', 'editorIds', 'reviewerIds', 'approverIds'] as $key) {
                    foreach ((array) ($payload[$key] ?? []) as $userId) {
                        if (is_numeric($userId)) {
                            $ids[] = (int) $userId;
                        }
                    }
                }
                foreach (['creatorId', 'approverId', 'publisherId'] as $key) {
                    if (isset($payload[$key]) && is_numeric($payload[$key])) {
                        $ids[] = (int) $payload[$key];
                    }
                }
            }
            $this->contentUsersCache[$contentId] = array_unique($ids);
        }

        return $this->contentUsersCache[$contentId];
    }

    private function grantMatches(User $user, array $grant): bool
    {
        $userId = (int) $user->id;
        switch ($grant['type']) {
            case 'user':
                return (int) $grant['id'] === $userId;
            case 'role':
                $roleKey = $user->role_key ?? $user->role?->key;

                return $roleKey !== null && (string) $grant['id'] === (string) $roleKey;
            case 'project':
                return is_numeric($grant['id']) && in_array($userId, $this->projectUserIds((int) $grant['id']), true);
            case 'content':
                return is_numeric($grant['id']) && in_array($userId, $this->contentUserIds((int) $grant['id']), true);
            default:
                return false;
        }
    }

    private function grantFor(User $user, DamDataTable $table): ?string
    {
        // بالاترین سطح میان همه grants منطبق.
        $access = null;
        foreach ($this->grantsOf($table) as $grant) {
            if ($this->grantMatches($user, $grant)) {
                if (($grant['access'] ?? 'view') === 'edit') {
                    return 'edit';
                }
                $access = 'view';
            }
        }

        return $access;
    }

    public function canView(User $user, DamDataTable $table): bool
    {
        if (! $this->withinDepartments($user, $table)) {
            return false;
        }
        if ($user->hasAnyPermission(['assets.manage_access'])) {
            return true;
        }
        if ((int) $table->created_by === (int) $user->id) {
            return true;
        }
        $grants = $this->grantsOf($table);
        if (empty($grants)) {
            return $user->hasPermission('assets.view');
        }

        return $this->grantFor($user, $table) !== null;
    }

    public function canEdit(User $user, DamDataTable $table): bool
    {
        if (! $this->withinDepartments($user, $table)) {
            return false;
        }
        if ($user->hasAnyPermission(['assets.manage_access'])) {
            return true;
        }
        if ((int) $table->created_by === (int) $user->id) {
            return $user->hasAnyPermission(['assets.edit_info', 'assets.upload']);
        }
        $grants = $this->grantsOf($table);
        if (empty($grants)) {
            return $user->hasAnyPermission(['assets.edit_info', 'assets.upload']);
        }

        return $this->grantFor($user, $table) === 'edit';
    }

    private function withinDepartments(User $user, DamDataTable $table): bool
    {
        app(OperationsSchema::class)->require('assets');
        if (! $user->isActive()) {
            return false;
        }
        if (! $table->departments()->exists()) {
            return true;
        } // Legacy unassigned tables remain panel-only.

        return $table->departments()->where('departments.status', 'active')->forMember($user)->exists();
    }

    public function botAllowed(User $user, DamDataTable $table, int $departmentId): bool
    {
        return $user->isActive() && $user->hasPermission('assets.view') && $this->canEdit($user, $table)
            && $table->departments()->where('departments.id', $departmentId)->where('departments.status', 'active')->forMember($user)->exists();
    }
}
