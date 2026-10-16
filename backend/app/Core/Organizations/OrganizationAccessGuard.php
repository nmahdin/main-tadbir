<?php

namespace App\Core\Organizations;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Workspaces\Workspace;

/**
 * Central operational-access rule for organizations (Stage C3-1).
 *
 * A suspended organization denies organization-scoped and
 * workspace operational access without deleting or mutating any
 * organization, workspace, membership, role, or operational
 * record. Personal workspaces are not organization-scoped and are
 * unaffected. This guard is deliberately not used by the platform
 * administrative directory, so suspension can never lock platform
 * administrators out of inspection or future reactivation.
 */
final class OrganizationAccessGuard
{
    public function allowsOperationalAccess(?Organization $organization): bool
    {
        return $organization === null
            || OrganizationStatus::of($organization->status)?->allowsOperationalAccess() === true;
    }

    public function allowsWorkspaceOperationalAccess(Workspace $workspace): bool
    {
        if ($workspace->isPersonal()) {
            return true;
        }

        return $this->allowsOperationalAccess($workspace->organization);
    }

    /**
     * @throws AuthorizationDeniedException when the organization is suspended
     */
    public function assertOperationalAccess(?Organization $organization): void
    {
        if ($this->allowsOperationalAccess($organization)) {
            return;
        }

        throw new AuthorizationDeniedException(
            AuthorizationDeniedException::ORGANIZATION_SUSPENDED,
            'The organization is suspended.',
        );
    }

    /**
     * @throws AuthorizationDeniedException when the owning organization is suspended
     */
    public function assertWorkspaceOperationalAccess(Workspace $workspace): void
    {
        if ($workspace->isOrganizational()) {
            $this->assertOperationalAccess($workspace->organization);
        }
    }
}
