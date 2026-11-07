<?php

namespace Tests\Feature\Core;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Organizations\ExecutionEligibility;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationExecutionDeniedException;
use App\Core\Organizations\OrganizationExecutionGuard;
use App\Core\Organizations\OrganizationLifecycleService;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C3-3 — organization execution guard contract and the
 * record-creation boundary. Core owns no organization-scoped
 * jobs today; these are the contract tests future job owners
 * inherit, plus enforcement where Core creation paths exist now.
 */
class OrganizationExecutionGuardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
    }

    public function test_eligibility_matrix_for_background_execution(): void
    {
        $guard = app(OrganizationExecutionGuard::class);
        [$organization, $workspace, $creator] = $this->organizationContext();
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);

        $this->assertSame(ExecutionEligibility::Executable, $guard->eligibilityForWorkspace($workspace));
        $this->assertSame(ExecutionEligibility::Executable, $guard->eligibilityForWorkspace($personal));
        // Personal/global operations have no organization scope.
        $this->assertSame(ExecutionEligibility::Executable, $guard->eligibilityForOrganization(null));

        $this->lifecycle()->suspend($this->admin(), $organization, 'Pause work');
        $this->assertSame(ExecutionEligibility::Paused, $guard->eligibilityForWorkspace($workspace->fresh()));
        $this->assertDenied(fn () => $guard->assertExecutableForWorkspace($workspace->fresh()), ExecutionEligibility::Paused);
        $this->assertSame(ExecutionEligibility::Executable, $guard->eligibilityForWorkspace($personal->fresh()));

        $this->lifecycle()->end($this->admin(), $organization->fresh(), 'Terminate work');
        $this->assertSame(ExecutionEligibility::Terminated, $guard->eligibilityForWorkspace($workspace->fresh()));
        $this->assertDenied(fn () => $guard->assertExecutableForWorkspace($workspace->fresh()), ExecutionEligibility::Terminated);

        // Restoration re-enables NEW work through normal rules;
        // the guard executes nothing by itself and resurrects no
        // pre-termination items (there is no queue to replay from,
        // and module owners must treat pre-end work as ineligible).
        $this->lifecycle()->restoreEnded($this->admin(), $organization->fresh(), 'Restore');
        $this->assertSame(ExecutionEligibility::Executable, $guard->eligibilityForWorkspace($workspace->fresh()));
    }

    public function test_forged_job_scope_claims_are_rejected(): void
    {
        $guard = app(OrganizationExecutionGuard::class);
        [$organization, $workspace] = $this->organizationContext('Forged A');
        [$otherOrganization] = $this->organizationContext('Forged B');
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault(
            User::factory()->create(['status' => 'active']),
        );

        // Correct claim on an active organization passes.
        $guard->assertJobScopeExecutable($workspace->id, $organization->id);
        $guard->assertJobScopeExecutable($personal->id);

        // A claim naming a different (even fully active)
        // organization is a forged scope.
        $this->assertScopeMismatch(fn () => $guard->assertJobScopeExecutable($workspace->id, $otherOrganization->id));
        $this->assertScopeMismatch(fn () => $guard->assertJobScopeExecutable($personal->id, $organization->id));
        $this->assertScopeMismatch(fn () => $guard->assertJobScopeExecutable(999999));

        // Once suspended, no claim can talk the guard into the
        // other organization's active state.
        $this->lifecycle()->suspend($this->admin(), $organization, 'Freeze');
        $this->assertDenied(
            fn () => $guard->assertJobScopeExecutable($workspace->id, $organization->id),
            ExecutionEligibility::Paused,
        );
        $this->assertScopeMismatch(fn () => $guard->assertJobScopeExecutable($workspace->id, $otherOrganization->id));
    }

    public function test_creation_of_org_workspaces_and_memberships_is_blocked_while_not_active(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $newcomer = User::factory()->create(['status' => 'active']);

        foreach (['suspend' => 'suspended', 'end' => 'ended'] as $operation => $state) {
            $this->lifecycle()->{$operation}($this->admin(), $organization->fresh(), "Block creation ({$state})");
            $this->assertSame($state, $organization->fresh()->status);

            try {
                Workspace::create(['name' => 'Blocked WS', 'organization_id' => $organization->id, 'status' => 'active']);
                $this->fail("Org workspace creation must be denied while {$state}.");
            } catch (AuthorizationDeniedException $exception) {
                $this->assertSame(AuthorizationDeniedException::ORGANIZATION_UNAVAILABLE, $exception->reason());
            }

            try {
                OrganizationMembership::create(['organization_id' => $organization->id, 'user_id' => $newcomer->id, 'status' => 'active']);
                $this->fail("Organization membership creation must be denied while {$state}.");
            } catch (AuthorizationDeniedException) {
                $this->addToAssertionCount(1);
            }

            try {
                WorkspaceMembership::create(['workspace_id' => $workspace->id, 'user_id' => $newcomer->id, 'status' => 'active']);
                $this->fail("Workspace membership creation must be denied while {$state}.");
            } catch (AuthorizationDeniedException) {
                $this->addToAssertionCount(1);
            }

            $this->assertSame(1, Workspace::where('organization_id', $organization->id)->count());
            $this->assertSame(1, OrganizationMembership::where('organization_id', $organization->id)->count());

            // Personal workspace creation for the same user is
            // never collateral damage.
            $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);
            $this->assertTrue($personal->isPersonal());

            if ($operation === 'suspend') {
                $this->lifecycle()->reactivate($this->admin(), $organization->fresh(), 'Unfreeze between cases');
            }
        }
    }

    private function assertDenied(callable $attempt, ExecutionEligibility $eligibility): void
    {
        try {
            $attempt();
            $this->fail('Execution must be denied.');
        } catch (OrganizationExecutionDeniedException $exception) {
            $this->assertSame('organization_not_executable', $exception->errorCode);
            $this->assertSame($eligibility, $exception->eligibility);
        }
    }

    private function assertScopeMismatch(callable $attempt): void
    {
        try {
            $attempt();
            $this->fail('Forged scope must be rejected.');
        } catch (OrganizationExecutionDeniedException $exception) {
            $this->assertSame('scope_mismatch', $exception->errorCode);
        }
    }

    /**
     * @return array{0: Organization, 1: Workspace, 2: User}
     */
    private function organizationContext(string $name = 'Guard Org'): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, $name.' '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$organization, $workspace, $creator];
    }

    private User $admin;

    private function admin(): User
    {
        return $this->admin ??= $this->makeAdmin();
    }

    private function makeAdmin(): User
    {
        $user = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        return $user;
    }

    private function lifecycle(): OrganizationLifecycleService
    {
        return app(OrganizationLifecycleService::class);
    }
}
