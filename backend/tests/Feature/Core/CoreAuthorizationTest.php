<?php

namespace Tests\Feature\Core;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Authorization\ConcurrencyErrors;
use App\Core\Authorization\Contracts\ModuleAvailabilityGate;
use App\Core\Authorization\Contracts\OrganizationPolicyGate;
use App\Core\Authorization\Contracts\SubscriptionEntitlementGate;
use App\Core\Authorization\GateDecision;
use App\Core\Authorization\InvalidAuthorizationContextException;
use App\Core\Authorization\ScopesToWorkspace;
use App\Core\Authorization\WorkspaceScope;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Exception;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CoreAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_personal_workspace_owner_context_resolves_with_role_permissions(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $context = $this->authorizer()->authorize($owner, $workspace->id, 'workspace.manage');

        $this->assertTrue($context->hasPermission('workspace.view'));
        $this->assertSame($workspace->id, $context->workspaceId());
        $this->assertTrue($this->authorizer()->can($owner, (string) $workspace->id, 'workspace.view'));
    }

    public function test_organizational_workspace_context_requires_both_memberships(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();

        $context = $this->authorizer()->authorize($creator, $workspace->id, 'workspace.view');
        $this->assertTrue($context->isOrganizational());
        $this->assertNotNull($context->organizationMembership);

        $member = User::factory()->create();
        $this->addWorkspaceMembership($workspace, $member);

        // Workspace membership without organization membership denies.
        $this->assertDeniedReason(
            AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_MISSING,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );

        $this->addOrganizationMembership($organization, $member);
        $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');
    }

    public function test_organization_membership_without_workspace_membership_is_denied(): void
    {
        [$organization, $workspace] = $this->organizationContext();
        $member = User::factory()->create();
        $this->addOrganizationMembership($organization, $member);

        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_MISSING,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );
        $this->assertFalse($this->authorizer()->can($member, $workspace->id, 'workspace.view'));
    }

    public function test_inactive_and_ended_memberships_are_denied(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $member = User::factory()->create();
        $membership = $this->addWorkspaceMembership($workspace, $member);
        $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');

        $membership->deactivate();
        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );

        $membership->end();
        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );
    }

    public function test_deactivated_organization_membership_blocks_organizational_context(): void
    {
        [$organization, $workspace] = $this->organizationContext();
        $member = User::factory()->create();
        $organizationMembership = $this->addOrganizationMembership($organization, $member);
        $this->addWorkspaceMembership($workspace, $member);
        $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');

        $organizationMembership->deactivate();

        $this->assertDeniedReason(
            AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );
    }

    public function test_inactive_user_and_inactive_workspace_are_denied(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $inactiveUser = User::factory()->create(['status' => 'inactive']);
        $this->addWorkspaceMembership($workspace, $inactiveUser);
        $this->assertDeniedReason(
            AuthorizationDeniedException::ACCOUNT_INACTIVE,
            fn () => $this->authorizer()->resolveContext($inactiveUser, $workspace->id),
        );

        $workspace->forceFill(['status' => 'suspended'])->save();
        $this->assertDeniedReason(
            AuthorizationDeniedException::WORKSPACE_INACTIVE,
            fn () => $this->authorizer()->resolveContext($owner, $workspace->id),
        );
    }

    #[DataProvider('invalidWorkspaceIdentifiers')]
    public function test_invalid_workspace_identifiers_are_rejected(int|string|null $workspaceId): void
    {
        $user = User::factory()->create();

        try {
            $this->authorizer()->resolveContext($user, $workspaceId);
            $this->fail('Invalid workspace identifiers must not resolve.');
        } catch (InvalidAuthorizationContextException $e) {
            $this->assertSame(404, $e->httpStatus());
            $this->assertSame('workspace_not_found', $e->reason());
        }
    }

    /**
     * @return array<string, array{0: int|string|null}>
     */
    public static function invalidWorkspaceIdentifiers(): array
    {
        return [
            'null' => [null],
            'empty string' => [''],
            'non numeric' => ['abc'],
            'partial numeric' => ['12x'],
            'zero' => [0],
            'negative' => [-3],
            'missing row' => [999999],
        ];
    }

    public function test_cross_workspace_and_cross_organization_access_is_denied(): void
    {
        [$organizationA, $workspaceA, $creatorA] = $this->organizationContext('Org A');
        [$organizationB, $workspaceB] = $this->organizationContext('Org B');

        // Full member of workspace A means nothing in organization B.
        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_MISSING,
            fn () => $this->authorizer()->resolveContext($creatorA, $workspaceB->id),
        );

        $member = User::factory()->create();
        $this->addOrganizationMembership($organizationA, $member);
        $this->addWorkspaceMembership($workspaceA, $member);
        $this->authorizer()->authorize($member, $workspaceA->id, 'workspace.view');

        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_MISSING,
            fn () => $this->authorizer()->resolveContext($member, $workspaceB->id),
        );
    }

    public function test_missing_and_unknown_permissions_fail_closed(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $member = User::factory()->create();
        $this->addWorkspaceMembership($workspace, $member);

        $this->assertDeniedReason(
            AuthorizationDeniedException::PERMISSION_MISSING,
            fn () => $this->authorizer()->authorize($member, $workspace->id, 'workspace.members.manage'),
        );

        try {
            $this->authorizer()->authorize($member, $workspace->id, 'workspace.fly');
            $this->fail('Unknown permission keys must be rejected, never granted.');
        } catch (RbacValidationException) {
            $this->assertTrue(true);
        }

        try {
            $this->authorizer()->authorize($member, $workspace->id, 'organization.view');
            $this->fail('Cross-scope permission keys must be rejected.');
        } catch (RbacValidationException) {
            $this->assertFalse($this->authorizer()->can($member, $workspace->id, 'organization.view'));
        }
    }

    public function test_contexts_are_isolated_per_workspace_for_the_same_user(): void
    {
        [$organization, $workspace] = $this->organizationContext();
        $user = User::factory()->create();
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);
        $this->addOrganizationMembership($organization, $user);
        $this->addWorkspaceMembership($workspace, $user);

        $personalContext = $this->authorizer()->resolveContext($user, $personal->id);
        $organizationalContext = $this->authorizer()->resolveContext($user, $workspace->id);

        // Workspace Manager at home, plain Member in the organization
        // workspace: permission snapshots must not bleed across.
        $this->assertTrue($personalContext->hasPermission('workspace.roles.manage'));
        $this->assertFalse($organizationalContext->hasPermission('workspace.roles.manage'));
        $this->assertTrue($organizationalContext->hasPermission('workspace.view'));
    }

    public function test_query_scoping_and_direct_object_reference_protection(): void
    {
        [$organization, $workspaceA] = $this->organizationContext();
        $workspaceB = Workspace::factory()->organizational()->create(['organization_id' => $organization->id]);

        $member = User::factory()->create();
        $this->addOrganizationMembership($organization, $member);
        $membershipA = $this->addWorkspaceMembership($workspaceA, $member);
        $this->addWorkspaceMembership($workspaceB, User::factory()->create());

        $context = $this->authorizer()->resolveContext($member, $workspaceA->id);

        $scopedIds = WorkspaceScope::apply(WorkspaceMembership::query(), $context)->pluck('id')->sort()->values()->all();
        $expectedIds = WorkspaceMembership::where('workspace_id', $workspaceA->id)->pluck('id')->sort()->values()->all();
        $this->assertSame($expectedIds, $scopedIds);
        $this->assertContains($membershipA->id, $scopedIds);

        // Foreign record fetched by bare ID: indistinguishable from missing.
        $foreignRecord = WorkspaceMembership::where('workspace_id', $workspaceB->id)->firstOrFail();
        try {
            WorkspaceScope::assertRecordInContext($foreignRecord, $context);
            $this->fail('A foreign record must not validate against the context.');
        } catch (InvalidAuthorizationContextException $e) {
            $this->assertSame(404, $e->httpStatus());
        }

        WorkspaceScope::assertRecordInContext($membershipA, $context);
        WorkspaceScope::assertNestedInContext($membershipA, $workspaceA, $context);
    }

    public function test_workspace_owned_trait_provides_the_scoping_contract(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $other = app(PersonalWorkspaceProvisioner::class)->ensureDefault(User::factory()->create());
        $this->addWorkspaceMembership($other, User::factory()->create());

        $context = $this->authorizer()->resolveContext($owner, $workspace->id);

        $scoped = ScopedWorkspaceRecordDouble::query()->forContext($context)->pluck('workspace_id')->unique()->all();
        $this->assertSame([$workspace->id], $scoped);

        $record = ScopedWorkspaceRecordDouble::query()->where('workspace_id', $workspace->id)->firstOrFail();
        $this->assertTrue($record->isInWorkspace($workspace));
        $this->assertFalse($record->isInWorkspace($other));
        $this->assertSame($workspace->id, $record->getWorkspaceId());
    }

    public function test_unimplemented_gates_fail_closed_for_module_operations(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        // The owner holds the permission, but no gate is implemented:
        // a module operation must deny, never fall through to a grant.
        try {
            $this->authorizer()->authorize($owner, $workspace->id, 'workspace.view', 'projects');
            $this->fail('Unimplemented gates must fail closed.');
        } catch (AuthorizationDeniedException $e) {
            $this->assertSame(AuthorizationDeniedException::GATE_UNIMPLEMENTED, $e->reason());
            $this->assertSame(403, $e->httpStatus());
        }

        $this->assertFalse($this->authorizer()->can($owner, $workspace->id, 'workspace.view', 'projects'));
        // Foundation (non-module) authorization is unaffected.
        $this->authorizer()->authorize($owner, $workspace->id, 'workspace.view');
    }

    public function test_implemented_gates_are_evaluated_and_can_deny(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $allow = new class implements ModuleAvailabilityGate
        {
            public function evaluate(Workspace $workspace, string $moduleId): GateDecision
            {
                return GateDecision::allow();
            }
        };
        $denyPolicy = new class implements OrganizationPolicyGate
        {
            public function evaluate(Workspace $workspace, string $permissionKey): GateDecision
            {
                return GateDecision::deny('Organization policy prohibits this.');
            }
        };
        $allowEntitlement = new class implements SubscriptionEntitlementGate
        {
            public function evaluate(Workspace $workspace, string $moduleId): GateDecision
            {
                return GateDecision::allow();
            }
        };

        $service = new AuthorizationService(null, $allow, $denyPolicy, $allowEntitlement);

        $this->assertDeniedReason(
            AuthorizationDeniedException::GATE_DENIED,
            fn () => $service->authorize($owner, $workspace->id, 'workspace.view', 'projects'),
        );

        $allowPolicy = new class implements OrganizationPolicyGate
        {
            public function evaluate(Workspace $workspace, string $permissionKey): GateDecision
            {
                return GateDecision::allow();
            }
        };
        $open = new AuthorizationService(null, $allow, $allowPolicy, $allowEntitlement);
        $open->authorize($owner, $workspace->id, 'workspace.view', 'projects');
    }

    public function test_decisions_are_re_resolved_after_role_and_membership_changes(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $member = User::factory()->create();
        $this->addOrganizationMembership($organization, $member);
        $membership = $this->addWorkspaceMembership($workspace, $member);
        $service = app(WorkspaceRoleService::class);

        $service->assignRole($creator, $membership, app(RoleProvisioner::class)->workspaceManager($workspace));
        $this->authorizer()->authorize($member, $workspace->id, 'workspace.roles.manage');

        // Demotion takes effect on the very next decision (no caching).
        $service->assignRole($creator, $membership->refresh(), app(RoleProvisioner::class)->workspaceMember($workspace));
        $this->assertDeniedReason(
            AuthorizationDeniedException::PERMISSION_MISSING,
            fn () => $this->authorizer()->authorize($member, $workspace->id, 'workspace.roles.manage'),
        );

        // Deactivation likewise closes the context immediately.
        $membership->refresh()->deactivate();
        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );
    }

    public function test_ended_workspace_membership_then_rejoin_with_active_membership(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $member = User::factory()->create();
        $this->addOrganizationMembership($organization, $member);
        $oldMembership = $this->addWorkspaceMembership($workspace, $member);

        // Give the historical record real authority, then end it.
        app(WorkspaceRoleService::class)->assignRole(
            $creator,
            $oldMembership,
            app(RoleProvisioner::class)->workspaceManager($workspace),
        );
        $this->authorizer()->authorize($member, $workspace->id, 'workspace.roles.manage');

        $oldMembership->end();
        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );

        // Rejoining creates a NEW membership; the resolver must select
        // it, and the historical manager role must NOT come back.
        $rejoined = $this->addWorkspaceMembership($workspace, $member);
        $this->assertNotSame($oldMembership->id, $rejoined->id);

        $context = $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');
        $this->assertSame($rejoined->id, $context->workspaceMembership->id);
        $this->assertFalse($context->hasPermission('workspace.roles.manage'));
    }

    public function test_ended_workspace_membership_then_rejoin_deactivated(): void
    {
        $owner = User::factory()->create();
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $member = User::factory()->create();
        $oldMembership = $this->addWorkspaceMembership($workspace, $member);
        $oldMembership->end();

        $rejoined = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Deactivated,
            'deactivated_at' => now(),
        ]);
        app(WorkspaceRoleService::class)->assignSystemRole(
            $rejoined,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        $this->assertDeniedReason(
            AuthorizationDeniedException::MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );

        // Reactivating the NEW record (not the ended history) restores
        // resolution, proving the resolver follows the current record.
        $rejoined->reactivate();
        $context = $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');
        $this->assertSame($rejoined->id, $context->workspaceMembership->id);
    }

    public function test_ended_organization_membership_then_rejoin_with_active_membership(): void
    {
        [$organization, $workspace, $creator] = $this->organizationContext();
        $member = User::factory()->create();
        $oldOrganizationMembership = $this->addOrganizationMembership($organization, $member);
        $this->addWorkspaceMembership($workspace, $member);

        // Historical record carries organization-management authority.
        app(OrganizationRoleService::class)->assignRole(
            $creator,
            $oldOrganizationMembership,
            app(RoleProvisioner::class)->organizationManager($organization),
        );

        $oldOrganizationMembership->end();
        $this->assertDeniedReason(
            AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );

        $rejoined = $this->addOrganizationMembership($organization, $member);
        $this->assertNotSame($oldOrganizationMembership->id, $rejoined->id);

        $context = $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');
        $this->assertSame($rejoined->id, $context->organizationMembership->id);

        // No automatic restoration of the historical manager authority.
        $organizationKeys = app(MembershipPermissions::class)
            ->organizationPermissionKeys($member, $organization);
        $this->assertSame(['organization.view'], $organizationKeys);
    }

    public function test_ended_organization_membership_then_rejoin_deactivated(): void
    {
        [$organization, $workspace] = $this->organizationContext();
        $member = User::factory()->create();
        $oldOrganizationMembership = $this->addOrganizationMembership($organization, $member);
        $this->addWorkspaceMembership($workspace, $member);
        $oldOrganizationMembership->end();

        $rejoined = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $member->id,
            'status' => MembershipStatus::Deactivated,
            'deactivated_at' => now(),
        ]);
        app(OrganizationRoleService::class)->assignSystemRole(
            $rejoined,
            app(RoleProvisioner::class)->organizationMember($organization),
        );

        $this->assertDeniedReason(
            AuthorizationDeniedException::ORGANIZATION_MEMBERSHIP_INACTIVE,
            fn () => $this->authorizer()->resolveContext($member, $workspace->id),
        );

        $rejoined->reactivate();
        $context = $this->authorizer()->authorize($member, $workspace->id, 'workspace.view');
        $this->assertSame($rejoined->id, $context->organizationMembership->id);
    }

    public function test_retryable_concurrency_errors_are_classified_not_denied(): void
    {
        $lockTimeout = new Exception('SQLSTATE[HY000]: General error: 1205 Lock wait timeout exceeded; try restarting transaction');

        $this->assertTrue(ConcurrencyErrors::isRetryable($lockTimeout));
        $this->assertFalse(ConcurrencyErrors::isRetryable(new Exception('permission denied')));

        $wrapped = ConcurrencyErrors::wrap($lockTimeout);
        $this->assertSame(503, $wrapped->httpStatus());
        $this->assertSame('concurrency_retryable', $wrapped->reason());
    }

    private function authorizer(): AuthorizationService
    {
        return app(AuthorizationService::class);
    }

    private function assertDeniedReason(string $expectedReason, callable $callback): void
    {
        try {
            $callback();
            $this->fail("Expected authorization denial [{$expectedReason}].");
        } catch (AuthorizationDeniedException $e) {
            $this->assertSame($expectedReason, $e->reason());
            $this->assertSame(403, $e->httpStatus());
        }
    }

    /**
     * @return array{0: Organization, 1: Workspace, 2: User}
     */
    private function organizationContext(string $name = 'Acme Org'): array
    {
        $creator = User::factory()->create();
        $organization = app(OrganizationProvisioner::class)->create($creator, $name);
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$organization, $workspace, $creator];
    }

    private function addOrganizationMembership(Organization $organization, User $user): OrganizationMembership
    {
        $membership = OrganizationMembership::create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'status' => MembershipStatus::Active,
        ]);

        app(OrganizationRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->organizationMember($organization),
        );

        return $membership->refresh();
    }

    private function addWorkspaceMembership(Workspace $workspace, User $user): WorkspaceMembership
    {
        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $user->id,
            'status' => MembershipStatus::Active,
        ]);

        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        return $membership->refresh();
    }
}

/**
 * WorkspaceOwned test double over the real workspace_memberships table,
 * proving the ScopesToWorkspace contract without touching legacy models.
 */
class ScopedWorkspaceRecordDouble extends Model
{
    use ScopesToWorkspace;

    protected $table = 'workspace_memberships';

    protected $guarded = [];

    public $timestamps = false;
}
