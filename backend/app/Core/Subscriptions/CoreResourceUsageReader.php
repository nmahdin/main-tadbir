<?php

namespace App\Core\Subscriptions;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use Illuminate\Support\Facades\DB;

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
 *  - projects (C5-EXT-01 M1): ACTIVE projects = rows in `projects`
 *    scoped to the owner's workspaces whose status is not terminal
 *    (completed/cancelled/archived; archive state on `projects` is
 *    purely the status — the table has no archived_at column).
 *    Legacy projects without `workspace_id` belong to no owner and
 *    are never counted (never attributed by guessing);
 *  - storage_bytes (C5-EXT-01 M1): measured ONLY over supported
 *    storage-owning records — DAM files (`dam_files.file_size`,
 *    every stored version, not only the latest) of assets owned by
 *    the personal-workspace owner user. DAM assets carry no
 *    organization/workspace context, so organization storage
 *    remains UNKNOWN (null) rather than fabricated; task
 *    attachments store size as free text and are unsupported.
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
                'projects' => $this->activeProjects($workspaceIds),
                // Unsupported for organizations: DAM assets have no
                // organization context (see class docblock).
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
            'projects' => $this->activeProjects([(int) $workspace->id]),
            'storage_bytes' => $this->personalStorageBytes($workspace),
        ];
    }

    /**
     * Active projects in the given workspaces (C5-EXT-01 M1):
     * non-terminal statuses only; archived rows never count, so
     * completing/cancelling/archiving frees quota without deleting
     * any data.
     *
     * @param  list<int>  $workspaceIds
     */
    private function activeProjects(array $workspaceIds): int
    {
        if ($workspaceIds === []) {
            return 0;
        }

        return (int) DB::table('projects')
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotIn('status', ['completed', 'cancelled', 'archived'])
            ->count();
    }

    /**
     * Supported storage measure for a personal owner (C5-EXT-01 M1):
     * every stored DAM file version of assets owned by the user.
     * Returns null only if the owner identity is missing, so callers
     * can distinguish "zero" from "unknown".
     */
    private function personalStorageBytes(Workspace $workspace): ?int
    {
        if ($workspace->owner_user_id === null) {
            return null;
        }

        return (int) DB::table('dam_files')
            ->join('dam_assets', 'dam_assets.id', '=', 'dam_files.asset_id')
            ->where('dam_assets.owner_id', $workspace->owner_user_id)
            ->sum('dam_files.file_size');
    }
}
