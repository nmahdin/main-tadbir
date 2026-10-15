<?php

namespace App\Core\Workspaces;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Models\User;

/**
 * Foundation-level workspace visibility (Stage 03A).
 *
 * This answers only "may this user see that this workspace exists and open
 * it" — it is NOT the Stage 04 central authorization decision and grants
 * no permission to any operational data. Rules (ADR-0002/0003):
 *  - personal workspace: the owner, or an active workspace member;
 *  - organizational workspace: an active workspace member who also holds
 *    an active organization membership. Organization membership alone
 *    never suffices.
 */
final class WorkspaceAccess
{
    public function canAccess(User $user, Workspace $workspace): bool
    {
        if (! $workspace->isActive()) {
            return false;
        }

        if ($workspace->isPersonal()) {
            return (int) $workspace->owner_user_id === (int) $user->id
                || $this->hasActiveWorkspaceMembership($user, $workspace);
        }

        return $this->hasActiveWorkspaceMembership($user, $workspace)
            && OrganizationMembership::where('organization_id', $workspace->organization_id)
                ->where('user_id', $user->id)
                ->where('status', MembershipStatus::Active->value)
                ->exists();
    }

    private function hasActiveWorkspaceMembership(User $user, Workspace $workspace): bool
    {
        return $workspace->memberships()
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->exists();
    }
}
