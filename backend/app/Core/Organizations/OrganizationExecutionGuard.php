<?php

namespace App\Core\Organizations;

use App\Core\Workspaces\Workspace;

/**
 * Service-level execution policy for organization- and
 * workspace-owned background operations (Stage C3-3).
 *
 * Core currently owns no queued or scheduled organization jobs
 * (see the C3-3 inventory), so this guard is the contract those
 * future operations must consult before reading or modifying
 * operational data — and it is enforced today at the Core
 * record-creation boundary through the membership/workspace
 * models.
 *
 * Scope is always resolved from persisted records: a job payload's
 * claimed organization ID is never sufficient proof. For a
 * workspace-anchored job, the owning organization is derived from
 * the workspace row itself, and a contradicting claim is treated
 * as a forged scope and rejected.
 */
final class OrganizationExecutionGuard
{
    public function eligibilityForOrganization(?Organization $organization): ExecutionEligibility
    {
        return match (OrganizationStatus::of($organization?->status)) {
            OrganizationStatus::Active, null => ExecutionEligibility::Executable,
            OrganizationStatus::Suspended => ExecutionEligibility::Paused,
            OrganizationStatus::Ended => ExecutionEligibility::Terminated,
        };
    }

    public function eligibilityForWorkspace(Workspace $workspace): ExecutionEligibility
    {
        if ($workspace->isPersonal()) {
            return ExecutionEligibility::Executable;
        }

        // Re-read the owning organization from persisted state;
        // a stale or fabricated relation is never trusted.
        $organization = Organization::find($workspace->organization_id);
        if ($organization === null) {
            return ExecutionEligibility::Terminated;
        }

        return $this->eligibilityForOrganization($organization);
    }

    /**
     * @throws OrganizationExecutionDeniedException when execution is not permitted
     */
    public function assertExecutableForOrganization(Organization $organization): void
    {
        $this->assertEligible($this->eligibilityForOrganization($organization), 'organization');
    }

    /**
     * @throws OrganizationExecutionDeniedException when execution is not permitted
     */
    public function assertExecutableForWorkspace(Workspace $workspace): void
    {
        $this->assertEligible($this->eligibilityForWorkspace($workspace), 'workspace');
    }

    /**
     * Entry point for workspace-anchored background work. The
     * scope is anchored on the persisted workspace; when the
     * payload also claims an organization, the claim must match
     * the workspace's actual owner or the job is rejected as a
     * forged scope — even if the claimed organization is active
     * and the real one is not.
     *
     * @throws OrganizationExecutionDeniedException
     */
    public function assertJobScopeExecutable(int $workspaceId, ?int $claimedOrganizationId = null): Workspace
    {
        $workspace = Workspace::find($workspaceId);
        if ($workspace === null) {
            throw new OrganizationExecutionDeniedException(
                'scope_mismatch',
                null,
                'The job scope does not resolve to a persisted workspace.',
            );
        }

        if ($claimedOrganizationId !== null
            && (int) ($workspace->organization_id ?? 0) !== $claimedOrganizationId) {
            throw new OrganizationExecutionDeniedException(
                'scope_mismatch',
                null,
                'The claimed organization does not own the job workspace scope.',
            );
        }

        $this->assertExecutableForWorkspace($workspace);

        return $workspace;
    }

    /**
     * @throws OrganizationExecutionDeniedException
     */
    private function assertEligible(ExecutionEligibility $eligibility, string $scopeLabel): void
    {
        if ($eligibility->isExecutable()) {
            return;
        }

        throw new OrganizationExecutionDeniedException(
            'organization_not_executable',
            $eligibility,
            $eligibility === ExecutionEligibility::Paused
                ? "The owning organization is suspended; {$scopeLabel}-owned work is paused, not failed."
                : "The owning organization is ended; {$scopeLabel}-owned work must not execute.",
        );
    }
}
