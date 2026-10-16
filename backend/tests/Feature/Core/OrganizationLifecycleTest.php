<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationLifecycleException;
use App\Core\Organizations\OrganizationLifecycleService;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacAuthorizationException;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceAccess;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * Stage C3-1 — organization lifecycle and operational access
 * guard. Locking behavior on InnoDB is covered separately by
 * OrganizationLifecycleConcurrencyMysqlTest.
 */
class OrganizationLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
    }

    public function test_existing_organizations_default_to_active_version_one(): void
    {
        $organization = Organization::factory()->create();

        $this->assertSame('active', $organization->status);
        $this->assertSame(1, (int) $organization->status_version);
        $this->assertNull($organization->suspended_at);
        $this->assertNull($organization->suspended_by_user_id);
    }

    public function test_suspend_and_reactivate_are_audited_versioned_and_non_destructive(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext();
        $organizationMemberships = OrganizationMembership::where('organization_id', $organization->id)->count();
        $workspaceMemberships = WorkspaceMembership::where('workspace_id', $workspace->id)->count();

        $suspended = $this->lifecycle()->suspend($admin, $organization, 'Billing review', 1);

        $this->assertSame('suspended', $suspended->status);
        $this->assertSame(2, (int) $suspended->status_version);
        $this->assertNotNull($suspended->suspended_at);
        $this->assertSame($admin->id, (int) $suspended->suspended_by_user_id);
        $this->assertSame($organizationMemberships, OrganizationMembership::where('organization_id', $organization->id)->count());
        $this->assertSame($workspaceMemberships, WorkspaceMembership::where('workspace_id', $workspace->id)->count());
        $this->assertSame(
            MembershipStatus::Active,
            OrganizationMembership::where('organization_id', $organization->id)->where('user_id', $creator->id)->firstOrFail()->status,
        );
        $this->assertNotNull(
            WorkspaceMembership::where('workspace_id', $workspace->id)->where('user_id', $creator->id)->firstOrFail()->role_id,
        );

        $audit = AuditLog::where('action', 'organization.suspended')->sole();
        $this->assertSame($admin->id, (int) $audit->actor_user_id);
        $this->assertSame($organization->id, (int) $audit->target_id);
        $this->assertSame('active', $audit->summary['previous_status']);
        $this->assertSame('suspended', $audit->summary['new_status']);
        $this->assertSame('Billing review', $audit->summary['reason']);
        $this->assertSame(2, $audit->summary['status_version']);

        $reactivated = $this->lifecycle()->reactivate($admin, $suspended, 'Review complete', 2);

        $this->assertSame('active', $reactivated->status);
        $this->assertSame(3, (int) $reactivated->status_version);
        $this->assertNull($reactivated->suspended_at);
        $this->assertNull($reactivated->suspended_by_user_id);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'organization.reactivated',
            'actor_user_id' => $admin->id,
            'target_id' => $organization->id,
        ]);
    }

    public function test_reason_authority_and_transition_validation_fail_closed(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, , $creator] = $this->organizationContext();

        $this->assertLifecycleFails(
            'reason_required',
            fn () => $this->lifecycle()->suspend($admin, $organization, '   '),
        );
        $this->assertLifecycleFails(
            'platform_authority_required',
            fn () => $this->lifecycle()->suspend($creator, $organization, 'Manager attempt'),
        );

        $legacyRole = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(
            Permission::firstOrCreate(['key' => 'users.view'], ['label' => 'users.view', 'category' => 'tests']),
        );
        $legacy = User::factory()->create(['role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);
        $this->assertLifecycleFails(
            'platform_authority_required',
            fn () => $this->lifecycle()->suspend($legacy, $organization, 'Legacy attempt'),
        );

        $this->assertLifecycleFails(
            'stale_version',
            fn () => $this->lifecycle()->suspend($admin, $organization, 'Stale', 99),
        );
        $this->assertLifecycleFails(
            'invalid_transition',
            fn () => $this->lifecycle()->reactivate($admin, $organization, 'Already active'),
        );

        $this->lifecycle()->suspend($admin, $organization, 'Suspend once');
        $this->assertLifecycleFails(
            'invalid_transition',
            fn () => $this->lifecycle()->suspend($admin, $organization->fresh(), 'Suspend twice'),
        );
        $this->assertSame('suspended', $organization->fresh()->status);
    }

    public function test_audit_failure_rolls_back_the_transition(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization] = $this->organizationContext();

        AuditLog::creating(function (): void {
            throw new RuntimeException('audit storage unavailable (injected)');
        });

        try {
            $this->lifecycle()->suspend($admin, $organization, 'Must roll back');
            $this->fail('Suspension must fail when the audit write fails.');
        } catch (RuntimeException) {
            $fresh = $organization->fresh();
            $this->assertSame('active', $fresh->status);
            $this->assertSame(1, (int) $fresh->status_version);
            $this->assertNull($fresh->suspended_at);
        }
    }

    public function test_suspension_denies_workspace_and_organization_domain_access_but_not_personal_or_other_orgs(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext('Suspended Org');
        [$otherOrganization, $otherWorkspace] = $this->organizationContext('Other Org', $creator);
        $personalWorkspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);

        app(AuthorizationService::class)->authorize($creator, $workspace->id, 'workspace.view');
        app(AuthorizationService::class)->authorize($creator, $personalWorkspace->id, 'workspace.view');

        $this->lifecycle()->suspend($admin, $organization, 'Suspend domain access');

        try {
            app(AuthorizationService::class)->resolveContext($creator, $workspace->id);
            $this->fail('Suspended organization workspace context must be denied.');
        } catch (AuthorizationDeniedException $exception) {
            $this->assertSame(AuthorizationDeniedException::ORGANIZATION_UNAVAILABLE, $exception->reason());
        }
        $this->assertFalse(app(WorkspaceAccess::class)->canAccess($creator, $workspace->fresh()));
        $this->assertSame([], app(MembershipPermissions::class)->workspacePermissionKeys($creator, $workspace->fresh()));
        $this->assertSame([], app(MembershipPermissions::class)->organizationPermissionKeys($creator, $organization->fresh()));

        // Personal and unrelated active organization contexts survive.
        app(AuthorizationService::class)->authorize($creator, $personalWorkspace->id, 'workspace.view');
        app(AuthorizationService::class)->authorize($creator, $otherWorkspace->id, 'workspace.view');
        $this->assertTrue(app(WorkspaceAccess::class)->canAccess($creator, $personalWorkspace->fresh()));
        $this->assertTrue(app(WorkspaceAccess::class)->canAccess($creator, $otherWorkspace->fresh()));
        $this->assertNotSame([], app(MembershipPermissions::class)->organizationPermissionKeys($creator, $otherOrganization->fresh()));
    }

    public function test_suspension_blocks_core_role_mutations(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext();
        $member = User::factory()->create(['status' => 'active']);
        $organizationMembership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Active,
        ]);
        app(OrganizationRoleService::class)->assignSystemRole(
            $organizationMembership,
            app(RoleProvisioner::class)->organizationMember($organization),
        );

        $this->lifecycle()->suspend($admin, $organization, 'Freeze administration');

        try {
            app(OrganizationRoleService::class)->assignRole(
                $creator,
                $organizationMembership->fresh(),
                app(RoleProvisioner::class)->organizationManager($organization),
            );
            $this->fail('Organization role assignment must be denied while suspended.');
        } catch (RbacAuthorizationException) {
            $this->assertSame(
                app(RoleProvisioner::class)->organizationMember($organization)->id,
                (int) $organizationMembership->fresh()->role_id,
            );
        }

        try {
            app(WorkspaceRoleService::class)->createCustomRole(
                $creator,
                $workspace->fresh(),
                'Blocked Role',
                ['workspace.view'],
                'blocked_role',
            );
            $this->fail('Workspace role creation must be denied while suspended.');
        } catch (RbacAuthorizationException) {
            $this->assertDatabaseMissing('core_roles', ['workspace_id' => $workspace->id, 'key' => 'blocked_role']);
        }
    }

    public function test_http_lists_show_and_writes_deny_suspended_organization_only(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext('Http Suspended Org');
        [$otherOrganization, $otherWorkspace] = $this->organizationContext('Http Other Org', $creator);
        $personalWorkspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($creator);

        $this->lifecycle()->suspend($admin, $organization, 'HTTP suspension');

        Sanctum::actingAs($creator);
        $workspaceIds = collect($this->getJson('/api/v1/core/workspaces')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertNotContains($workspace->id, $workspaceIds);
        $this->assertContains($personalWorkspace->id, $workspaceIds);
        $this->assertContains($otherWorkspace->id, $workspaceIds);

        $this->getJson("/api/v1/core/workspaces/{$workspace->id}")->assertForbidden();
        $this->getJson("/api/v1/core/workspaces/{$otherWorkspace->id}")->assertOk();

        $organizationIds = collect($this->getJson('/api/v1/core/organizations')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertNotContains($organization->id, $organizationIds);
        $this->assertContains($otherOrganization->id, $organizationIds);
        $this->getJson("/api/v1/core/organizations/{$organization->id}")->assertForbidden();
        $this->getJson("/api/v1/core/organizations/{$otherOrganization->id}")->assertOk();

        $this->postJson("/api/v1/core/workspaces/{$workspace->id}/roles", [
            'name' => 'Blocked Http Role',
            'key' => 'blocked_http_role',
            'permissions' => ['workspace.view'],
        ])->assertForbidden();
    }

    public function test_end_and_restore_ended_follow_the_special_contract(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace, $creator] = $this->organizationContext('Ended Org');

        // restoreEnded is not a substitute for ordinary states.
        $this->assertLifecycleFails('invalid_transition',
            fn () => $this->lifecycle()->restoreEnded($admin, $organization, 'Too early'));
        $this->assertLifecycleFails('platform_authority_required',
            fn () => $this->lifecycle()->end($creator, $organization, 'Manager attempt'));

        // active -> suspended -> ended; suspension metadata is
        // preserved as current-state history, termination is stamped.
        $suspended = $this->lifecycle()->suspend($admin, $organization, 'Freeze first');
        $ended = $this->lifecycle()->end($admin, $suspended, 'Business terminated');

        $this->assertSame('ended', $ended->status);
        $this->assertSame(3, (int) $ended->status_version);
        $this->assertNotNull($ended->ended_at);
        $this->assertSame($admin->id, (int) $ended->ended_by_user_id);
        $this->assertNotNull($ended->suspended_at);

        // Ended denies operational access exactly like suspended...
        try {
            app(AuthorizationService::class)->resolveContext($creator, $workspace->id);
            $this->fail('Ended organization workspace context must be denied.');
        } catch (AuthorizationDeniedException $exception) {
            // ...with the same generic member-facing reason.
            $this->assertSame(AuthorizationDeniedException::ORGANIZATION_UNAVAILABLE, $exception->reason());
        }
        $this->assertFalse(app(WorkspaceAccess::class)->canAccess($creator, $workspace->fresh()));

        // ...and ordinary reactivation cannot revive it.
        $this->assertLifecycleFails('invalid_transition',
            fn () => $this->lifecycle()->reactivate($admin, $ended, 'Normal reactivation'));
        $this->assertLifecycleFails('invalid_transition',
            fn () => $this->lifecycle()->suspend($admin, $ended, 'Suspend the ended'));
        $this->assertLifecycleFails('invalid_transition',
            fn () => $this->lifecycle()->end($admin, $ended, 'End twice'));
        $this->assertLifecycleFails('platform_authority_required',
            fn () => $this->lifecycle()->restoreEnded($creator, $ended, 'Manager restore'));

        $restored = $this->lifecycle()->restoreEnded($admin, $ended, 'Business resumed under new ownership');

        $this->assertSame('active', $restored->status);
        $this->assertSame(4, (int) $restored->status_version);
        $this->assertNull($restored->ended_at);
        $this->assertNull($restored->ended_by_user_id);
        $this->assertNull($restored->suspended_at);
        app(AuthorizationService::class)->authorize($creator, $workspace->id, 'workspace.view');

        $this->assertDatabaseHas('audit_logs', ['action' => 'organization.ended', 'actor_user_id' => $admin->id, 'target_id' => $organization->id]);
        $restoreAudit = AuditLog::where('action', 'organization.restored')->sole();
        $this->assertSame('ended', $restoreAudit->summary['previous_status']);
        $this->assertSame('active', $restoreAudit->summary['new_status']);
        $this->assertSame('Business resumed under new ownership', $restoreAudit->summary['reason']);
    }

    public function test_invalid_transition_matrix_is_rejected(): void
    {
        $admin = $this->primaryAdministrator();

        foreach (['active', 'suspended', 'ended'] as $state) {
            $organization = $this->organizationInState($admin, $state);
            $invalidOps = match ($state) {
                'active' => ['reactivate', 'restoreEnded'],
                'suspended' => ['suspend', 'restoreEnded'],
                'ended' => ['suspend', 'reactivate', 'end'],
            };
            foreach ($invalidOps as $operation) {
                $this->assertLifecycleFails(
                    'invalid_transition',
                    fn () => $this->lifecycle()->{$operation}($admin, $organization->fresh(), 'Matrix probe'),
                );
            }
            $this->assertSame($state, $organization->fresh()->status);
        }
    }

    public function test_restore_never_touches_memberships_workspaces_roles_or_schedules(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization, $workspace] = $this->organizationContext('Preserved Org');
        $before = $this->preservationSnapshot($organization, $workspace);

        $this->lifecycle()->end($admin, $organization, 'Terminate');
        $this->assertSame($before, $this->preservationSnapshot($organization, $workspace));
        $this->lifecycle()->restoreEnded($admin, $organization->fresh(), 'Restore');

        // Restoration changes only the lifecycle state: it does
        // not reactivate, reassign, or reschedule anything else.
        // (Core has no organization-owned scheduled jobs yet;
        // C3-3 owns background integration and must not replay
        // pre-termination pending work.)
        $this->assertSame($before, $this->preservationSnapshot($organization, $workspace));
        $this->assertSame('active', $workspace->fresh()->status);
    }

    public function test_audit_failure_rolls_back_end_transition(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization] = $this->organizationContext('End Rollback Org');

        AuditLog::creating(function (): void {
            throw new RuntimeException('audit storage unavailable (injected)');
        });

        try {
            $this->lifecycle()->end($admin, $organization, 'Must roll back');
            $this->fail('Ending must fail when the audit write fails.');
        } catch (RuntimeException) {
            $fresh = $organization->fresh();
            $this->assertSame('active', $fresh->status);
            $this->assertSame(1, (int) $fresh->status_version);
            $this->assertNull($fresh->ended_at);
        }
    }

    public function test_platform_directory_remains_available_for_suspended_organizations(): void
    {
        $admin = $this->primaryAdministrator();
        [$organization] = $this->organizationContext('Directory Suspended Org');

        $this->lifecycle()->suspend($admin, $organization, 'Directory visibility');

        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/v1/platform/organizations?search=Directory Suspended')->assertOk();
        $response->assertJsonPath('data.0.id', $organization->id);
        $response->assertJsonPath('data.0.status', 'suspended');
    }

    /**
     * @return array{0: Organization, 1: Workspace, 2: User}
     */
    private function organizationContext(string $name = 'Acme Org', ?User $creator = null): array
    {
        $creator ??= User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, $name.' '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$organization, $workspace, $creator];
    }

    private function organizationInState(User $admin, string $state): Organization
    {
        [$organization] = $this->organizationContext('Matrix '.ucfirst($state).' Org');
        if ($state === 'suspended') {
            $this->lifecycle()->suspend($admin, $organization, 'Matrix setup');
        } elseif ($state === 'ended') {
            $this->lifecycle()->end($admin, $organization, 'Matrix setup');
        }

        return $organization->fresh();
    }

    /**
     * @return array<string, mixed>
     */
    private function preservationSnapshot(Organization $organization, Workspace $workspace): array
    {
        return [
            'organization_memberships' => OrganizationMembership::where('organization_id', $organization->id)
                ->get(['user_id', 'role_id', 'status'])->toArray(),
            'workspace_memberships' => WorkspaceMembership::where('workspace_id', $workspace->id)
                ->get(['user_id', 'role_id', 'status'])->toArray(),
            'workspaces' => Workspace::where('organization_id', $organization->id)
                ->get(['id', 'status', 'is_default'])->toArray(),
        ];
    }

    private function primaryAdministrator(): User
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

    private function assertLifecycleFails(string $code, callable $attempt): void
    {
        try {
            $attempt();
            $this->fail("Organization lifecycle operation must fail with [{$code}].");
        } catch (OrganizationLifecycleException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
