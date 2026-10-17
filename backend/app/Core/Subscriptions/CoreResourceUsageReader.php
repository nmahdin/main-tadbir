<?php

namespace App\Core\Subscriptions;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;

/**
 * Usage measurement over persisted Core data (Stage C5-4).
 *
 * Supported dimensions:
 *  - workspaces: organizations own N workspaces; a personal owner
 *    owns exactly its one workspace;
 *  - organization_members: ACTIVE organization memberships
 *    (personal owners: not applicable -> unknown);
 *  - workspace_members: the binding (maximum) ACTIVE membership
 *    count across the owner's workspaces — a per-workspace limit
 *    binds at the fullest workspace;
 *  - storage_bytes: UNKNOWN — no Files Core exists yet (C9 owns
 *    file storage), so any number here would be fabricated.
 */
final class CoreResourceUsageReader implements ResourceUsageReader
{
    public function measure(SubscriptionOwner $owner): array
    {
        if ($owner->type === 'organization') {
            $organization = $owner->organization;
            $workspaceIds = Workspace::query()
                ->where('organization_id', $organization->id)
                ->pluck('id')
                ->map(fn ($id): int => (int) $id)
                ->all();

            $perWorkspace = WorkspaceMembership::query()
                ->whereIn('workspace_id', $workspaceIds)
                ->where('status', MembershipStatus::Active->value)
                ->selectRaw('workspace_id, COUNT(*) as aggregate')
                ->groupBy('workspace_id')
                ->pluck('aggregate')
                ->map(fn ($count): int => (int) $count)
                ->all();

            return [
                'workspaces' => count($workspaceIds),
                'organization_members' => OrganizationMembership::query()
                    ->where('organization_id', $organization->id)
                    ->where('status', MembershipStatus::Active->value)
                    ->count(),
                'workspace_members' => $perWorkspace === [] ? 0 : max($perWorkspace),
                'storage_bytes' => null,
            ];
        }

        $workspace = $owner->personalWorkspace;

        return [
            'workspaces' => 1,
            'organization_members' => null,
            'workspace_members' => WorkspaceMembership::query()
                ->where('workspace_id', $workspace->id)
                ->where('status', MembershipStatus::Active->value)
                ->count(),
            'storage_bytes' => null,
        ];
    }
}
