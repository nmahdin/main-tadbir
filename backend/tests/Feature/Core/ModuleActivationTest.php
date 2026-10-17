<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleAccessDeniedException;
use App\Core\Modules\ModuleAccessGuard;
use App\Core\Modules\ModuleActivationException;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\OrganizationModulePolicy;
use App\Core\Modules\WorkspaceModule;
use App\Core\Modules\WorkspaceModuleService;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C4-2 — workspace module activation, dependency planning,
 * organization policy, entitlement boundary, safe deactivation,
 * and the operational access guard. Successful activations inject
 * an explicit entitlement double; the production default stays
 * fail-closed and is asserted as such.
 */
class ModuleActivationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
    }

    public function test_manager_role_gains_modules_permission_member_and_custom_roles_do_not(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();

        $provisioner = app(RoleProvisioner::class);
        $managerKeys = $provisioner->workspaceManager($workspace)->permissionKeys();
        $memberKeys = $provisioner->workspaceMember($workspace)->permissionKeys();

        $this->assertContains('workspace.modules.manage', $managerKeys);
        $this->assertSame(['workspace.view'], $memberKeys);

        $custom = ScopedRole::create([
            'scope' => 'workspace', 'workspace_id' => $workspace->id,
            'key' => 'custom-'.uniqid(), 'name' => 'Custom', 'is_protected' => false,
        ]);

        // Re-running provisioning must not grant anything to
        // arbitrary roles, and the protected roles stay idempotent.
        $provisioner->ensureForWorkspace($workspace);
        PermissionCatalog::sync();

        $this->assertSame([], $custom->fresh()->permissionKeys());
        $this->assertSame($managerKeys, $provisioner->workspaceManager($workspace)->permissionKeys());
    }

    public function test_preview_is_deterministic_non_mutating_and_dependency_complete(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['events', 'calendar', 'content', 'crm', 'dam', 'finance', 'forms', 'tasks', 'workflows']);

        $planner = app(ModuleActivationPlanner::class);
        $first = $planner->preview($workspace, 'events');
        $second = $planner->preview($workspace, 'events');

        $expectedClosure = ['calendar', 'content', 'crm', 'dam', 'finance', 'forms', 'tasks', 'workflows'];
        $this->assertSame($expectedClosure, collect($first->prerequisites)->sort()->values()->all());
        $this->assertSame([...$first->prerequisites, 'events'], $first->toEnable);
        $this->assertSame([], $first->alreadyEnabled);
        $this->assertSame($first->confirmationToken, $second->confirmationToken);
        $this->assertSame(0, WorkspaceModule::count(), 'Preview must not mutate activation state.');

        // Every closure member is currently unimplemented, so the
        // preview must fail closed with module_unavailable reasons.
        $this->assertFalse($first->confirmable());
        $this->assertContains('module_unavailable', $first->blockingCodes());
    }

    public function test_preview_of_unknown_module_fails_closed(): void
    {
        [, $workspace] = $this->personalWorkspace();

        try {
            app(ModuleActivationPlanner::class)->preview($workspace, 'not-a-module');
            $this->fail('Unknown module must be rejected.');
        } catch (ModuleActivationException $exception) {
            $this->assertSame('module_unknown', $exception->errorCode);
        }
    }

    public function test_production_entitlement_default_denies_activation(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();

        // No entitlement double bound: the container default is the
        // fail-closed UnavailableModuleEntitlementGate.
        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $this->assertSame(['projects' => false], $preview->entitlements);
        $this->assertSame(['entitlement_missing'], $preview->blockingCodes());

        try {
            app(WorkspaceModuleService::class)->activate($owner, $workspace, 'projects', $preview->confirmationToken);
            $this->fail('Activation without entitlement must be rejected.');
        } catch (ModuleActivationException $exception) {
            $this->assertSame('entitlement_missing', $exception->errorCode);
            $this->assertSame(403, $exception->httpStatus);
        }

        $this->assertSame(0, WorkspaceModule::count());
    }

    public function test_confirmed_activation_is_atomic_audited_and_idempotent(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['projects']);

        $service = app(WorkspaceModuleService::class);
        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $this->assertTrue($preview->confirmable());

        $enabled = $service->activate($owner, $workspace, 'projects', $preview->confirmationToken);

        $this->assertSame(['projects'], $enabled);
        $row = WorkspaceModule::query()->where('workspace_id', $workspace->id)->sole();
        $this->assertTrue($row->isEnabled());
        $this->assertSame((int) $owner->id, (int) $row->enabled_by_user_id);
        $this->assertNotNull($row->enabled_at);
        $this->assertTrue(AuditLog::query()
            ->where('action', 'workspace.module_enabled')
            ->where('actor_user_id', $owner->id)
            ->exists());

        // Re-previewing shows the module already enabled; confirming
        // the fresh preview is a no-op (still exactly one row).
        $again = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $this->assertSame(['projects'], $again->alreadyEnabled);
        $this->assertSame([], $again->toEnable);
        $this->assertSame([], $service->activate($owner, $workspace, 'projects', $again->confirmationToken));
        $this->assertSame(1, WorkspaceModule::count());
    }

    public function test_activation_with_unavailable_or_unentitled_prerequisites_enables_nothing(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();

        // Entitled to everything except `forms`; every closure
        // member is also technically unavailable. Either way the
        // activation must fail closed with zero partial enablement.
        $this->entitle(['events', 'calendar', 'content', 'crm', 'dam', 'finance', 'tasks', 'workflows']);

        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'events');
        $this->assertFalse($preview->confirmable());
        $this->assertContains('module_unavailable', $preview->blockingCodes());
        $this->assertContains('entitlement_missing', $preview->blockingCodes());

        try {
            app(WorkspaceModuleService::class)->activate($owner, $workspace, 'events', $preview->confirmationToken);
            $this->fail('Blocked activation must be rejected.');
        } catch (ModuleActivationException $exception) {
            $this->assertContains($exception->errorCode, ['module_unavailable', 'entitlement_missing']);
        }

        $this->assertSame(0, WorkspaceModule::count(), 'No partial enablement may survive a blocked activation.');
    }

    public function test_stale_confirmation_token_is_rejected_with_409(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['projects']);

        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');

        // State drifts after preview: someone enables the module.
        $this->forceEnable($workspace, 'projects', $owner);

        try {
            app(WorkspaceModuleService::class)->activate($owner, $workspace, 'projects', $preview->confirmationToken);
            $this->fail('Stale preview must be rejected.');
        } catch (ModuleActivationException $exception) {
            $this->assertSame('module_activation_preview_stale', $exception->errorCode);
            $this->assertSame(409, $exception->httpStatus);
        }
    }

    public function test_activation_requires_the_dedicated_permission(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['projects']);
        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $service = app(WorkspaceModuleService::class);

        // Plain member (workspace.view only).
        $member = User::factory()->create(['status' => 'active']);
        WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $member->id,
            'role_id' => app(RoleProvisioner::class)->workspaceMember($workspace)->id,
            'status' => MembershipStatus::Active,
        ]);
        $this->assertDenied(fn () => $service->activate($member, $workspace, 'projects', $preview->confirmationToken));

        // Workspace manager of a DIFFERENT workspace.
        [$otherManager] = $this->personalWorkspace();
        $this->assertDenied(fn () => $service->activate($otherManager, $workspace, 'projects', $preview->confirmationToken));

        // Platform Primary Administrator with no workspace membership.
        $platformAdmin = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $platformAdmin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);
        $this->assertDenied(fn () => $service->activate($platformAdmin, $workspace, 'projects', $preview->confirmationToken));

        // Suspended account, even in its own workspace.
        [$suspended, $suspendedWorkspace] = $this->personalWorkspace();
        $suspended->forceFill(['status' => 'suspended'])->save();
        $this->assertDenied(fn () => $service->activate($suspended, $suspendedWorkspace, 'projects', $preview->confirmationToken));

        $this->assertSame(0, WorkspaceModule::count());
    }

    public function test_organization_explicit_deny_blocks_even_when_entitled(): void
    {
        [$creator, $organization, $workspace] = $this->organizationWorkspace();
        $this->entitle(['projects']);

        OrganizationModulePolicy::create([
            'organization_id' => $organization->id,
            'module_id' => CoreModule::query()->where('key', 'projects')->sole()->id,
            'policy' => OrganizationModulePolicy::POLICY_DENIED,
        ]);

        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $this->assertSame('denied', $preview->organizationPolicies['projects']);
        $this->assertSame(['organization_policy_denied'], $preview->blockingCodes());

        try {
            app(WorkspaceModuleService::class)->activate($creator, $workspace, 'projects', $preview->confirmationToken);
            $this->fail('Explicit organization deny must block activation.');
        } catch (ModuleActivationException $exception) {
            $this->assertSame('organization_policy_denied', $exception->errorCode);
            $this->assertSame(403, $exception->httpStatus);
        }

        $this->assertSame(0, WorkspaceModule::count());
    }

    public function test_suspended_organization_cannot_activate_or_use_modules(): void
    {
        [$creator, $organization, $workspace] = $this->organizationWorkspace();
        $this->entitle(['projects']);
        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');

        $organization->forceFill(['status' => 'suspended'])->save();

        $this->assertDenied(fn () => app(WorkspaceModuleService::class)
            ->activate($creator, $workspace, 'projects', $preview->confirmationToken));
        $this->assertSame(0, WorkspaceModule::count());
    }

    public function test_deactivation_protects_dependents_and_preserves_data(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $this->entitle(['projects']);
        $service = app(WorkspaceModuleService::class);

        $preview = app(ModuleActivationPlanner::class)->preview($workspace, 'projects');
        $service->activate($owner, $workspace, 'projects', $preview->confirmationToken);

        // Module data exists and must survive deactivation.
        $project = Project::create(['name' => 'Keep me', 'status' => 'active', 'workspace_id' => $workspace->id]);

        // An enabled transitive dependent protects its prerequisites.
        $this->forceEnable($workspace, 'surveys', $owner);

        try {
            $service->deactivate($owner, $workspace, 'forms');
            $this->fail('Deactivation with an active dependent must be rejected.');
        } catch (ModuleActivationException $exception) {
            $this->assertSame('module_has_active_dependents', $exception->errorCode);
            $this->assertSame(409, $exception->httpStatus);
            $this->assertSame(['surveys'], $exception->dependents);
        }

        $service->deactivate($owner, $workspace, 'projects');

        $row = WorkspaceModule::query()
            ->where('workspace_id', $workspace->id)
            ->whereHas('module', fn ($query) => $query->where('key', 'projects'))
            ->sole();
        $this->assertFalse($row->isEnabled(), 'The activation row is preserved, marked disabled — never deleted.');
        $this->assertSame((int) $owner->id, (int) $row->disabled_by_user_id);
        $this->assertDatabaseHas('projects', ['id' => $project->id, 'workspace_id' => $workspace->id]);
        $this->assertTrue(AuditLog::query()->where('action', 'workspace.module_disabled')->exists());

        // Idempotent: disabling again changes nothing.
        $service->deactivate($owner, $workspace, 'projects');
        $this->assertSame(2, WorkspaceModule::count());
    }

    public function test_guard_layers_over_rbac_and_fails_closed(): void
    {
        [$owner, $workspace] = $this->personalWorkspace();
        $guard = app(ModuleAccessGuard::class);

        // Disabled by default.
        try {
            $guard->authorize($owner, $workspace->id, 'workspace.view', 'projects');
            $this->fail('Disabled module must deny operational access.');
        } catch (ModuleAccessDeniedException $exception) {
            $this->assertSame(ModuleAccessDeniedException::MODULE_NOT_ENABLED, $exception->reason());
        }

        $this->forceEnable($workspace, 'projects', $owner);

        // Enabled but unentitled (production default gate).
        try {
            $guard->authorize($owner, $workspace->id, 'workspace.view', 'projects');
            $this->fail('Unentitled module must deny operational access.');
        } catch (ModuleAccessDeniedException $exception) {
            $this->assertSame(ModuleAccessDeniedException::ENTITLEMENT_MISSING, $exception->reason());
        }

        // Enabled + entitled double: access granted; RBAC is still
        // enforced underneath (an unknown permission is denied).
        $this->entitle(['projects']);
        $context = app(ModuleAccessGuard::class)->authorize($owner, $workspace->id, 'workspace.view', 'projects');
        $this->assertSame($workspace->id, $context->workspaceId());
    }

    public function test_pilot_http_denies_when_module_disabled_and_allows_when_enabled(): void
    {
        config(['projects.workspace_pilot.enabled' => true]);
        [$owner, $workspace] = $this->personalWorkspace();

        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/projects', [
            'name' => 'Blocked', 'status' => 'active', 'workspace_id' => $workspace->id,
        ])->assertForbidden();

        $this->forceEnable($workspace, 'projects', $owner);
        $id = $this->postJson('/api/v1/projects', [
            'name' => 'Allowed', 'status' => 'active', 'workspace_id' => $workspace->id,
        ])->assertCreated()->json('data.id');

        // Disabling immediately denies operational reads and writes.
        app(WorkspaceModuleService::class)->deactivate(
            $owner,
            $workspace,
            'projects',
        );
        $this->getJson("/api/v1/projects/{$id}", ['X-Workspace-Id' => (string) $workspace->id])->assertForbidden();
        $this->assertDatabaseHas('projects', ['id' => $id]);
    }

    private function assertDenied(callable $operation): void
    {
        try {
            $operation();
            $this->fail('Operation must be denied.');
        } catch (AuthorizationDeniedException) {
            $this->addToAssertionCount(1);
        }
    }

    /** @param list<string> $keys */
    private function entitle(array $keys): void
    {
        $this->app->instance(ModuleEntitlementGate::class, new class($keys) implements ModuleEntitlementGate
        {
            /** @param list<string> $keys */
            public function __construct(private readonly array $keys) {}

            public function isEntitled(Workspace $workspace, string $moduleKey): bool
            {
                return in_array($moduleKey, $this->keys, true);
            }
        });
    }

    private function forceEnable(Workspace $workspace, string $moduleKey, User $actor): void
    {
        WorkspaceModule::create([
            'workspace_id' => $workspace->id,
            'module_id' => CoreModule::query()->where('key', $moduleKey)->sole()->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
            'enabled_at' => now(),
            'enabled_by_user_id' => $actor->id,
        ]);
    }

    /** @return array{0: User, 1: Workspace} */
    private function personalWorkspace(): array
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        return [$owner, $workspace];
    }

    /** @return array{0: User, 1: Organization, 2: Workspace} */
    private function organizationWorkspace(): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Acme '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$creator, $organization, $workspace];
    }
}
