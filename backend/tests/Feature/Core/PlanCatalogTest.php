<?php

namespace Tests\Feature\Core;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\UnavailableModuleEntitlementGate;
use App\Core\Modules\WorkspaceModule;
use App\Core\Plans\CorePlan;
use App\Core\Plans\CorePlanVersion;
use App\Core\Plans\PlanModuleEntitlement;
use App\Core\Plans\PlanProvisioner;
use App\Core\Plans\PlanProvisioningException;
use App\Core\Plans\PlanResourceCatalog;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stage C5-1 — versioned plan catalog, entitlements, limits,
 * published-version immutability, and idempotent provisioning.
 * No subscriptions exist yet (C5-2); nothing here may create one,
 * activate a module, or grant RBAC permissions.
 */
class PlanCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();
    }

    public function test_plan_audiences_statuses_and_unique_keys(): void
    {
        $provisioner = app(PlanProvisioner::class);

        $plan = $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);
        $this->assertSame(CorePlan::STATUS_DRAFT, $plan->status);

        // Identical repeat provisioning is a no-op; drift is rejected.
        $this->assertTrue($plan->is($provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION)));
        $this->assertSame(1, CorePlan::count());
        $this->expectProvisioning('plan_drift', fn () => $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_PERSONAL));

        // Invalid audience / malformed key fail closed.
        $this->expectProvisioning('plan_audience_invalid', fn () => $provisioner->createPlan('x', 'X', 'enterprise'));
        $this->expectProvisioning('plan_key_invalid', fn () => $provisioner->createPlan('Bad Key', 'X', CorePlan::AUDIENCE_PERSONAL));

        // Status machine: draft -> active -> retired; retired is final.
        $provisioner->setPlanStatus('team', CorePlan::STATUS_ACTIVE);
        $provisioner->setPlanStatus('team', CorePlan::STATUS_RETIRED);
        $this->expectProvisioning('plan_status_invalid', fn () => $provisioner->setPlanStatus('team', CorePlan::STATUS_ACTIVE));
    }

    public function test_versions_are_unique_per_plan_with_default_grace_zero(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $provisioner->createPlan('solo', 'Solo', CorePlan::AUDIENCE_PERSONAL);
        $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);

        $version = $provisioner->createDraftVersion('solo', 1);
        $this->assertSame(0, (int) $version->grace_days, 'The default grace period is exactly 0 days.');
        $this->assertFalse($version->isPublished());

        // Same version number on another plan is a different version.
        $provisioner->createDraftVersion('team', 1, 14);
        $this->assertSame(14, (int) $provisioner->snapshot('team', 1)->graceDays);

        // Repeating with drifted grace is rejected, never rewritten;
        // an explicit draft update is the sanctioned path.
        $this->expectProvisioning('plan_version_drift', fn () => $provisioner->createDraftVersion('solo', 1, 7));
        $provisioner->updateDraftGrace('solo', 1, 7);
        $this->assertSame(7, $provisioner->snapshot('solo', 1)->graceDays);

        $this->expectProvisioning('plan_version_invalid', fn () => $provisioner->createDraftVersion('solo', 0));
        $this->expectProvisioning('plan_version_invalid', fn () => $provisioner->createDraftVersion('solo', 2, -1));
    }

    public function test_draft_content_editing_and_unknown_keys_fail_closed(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);
        $provisioner->createDraftVersion('team', 1);

        $provisioner->setModuleEntitlement('team', 1, 'projects', true);
        $provisioner->setModuleEntitlement('team', 1, 'tasks', false);
        $provisioner->setLimit('team', 1, 'workspaces', 3);
        $provisioner->setLimit('team', 1, 'storage_bytes', 0);
        $provisioner->setLimit('team', 1, 'organization_members', 0, true);

        // Re-setting a draft value overwrites in place (no duplicates).
        $provisioner->setModuleEntitlement('team', 1, 'projects', true);
        $this->assertSame(2, PlanModuleEntitlement::count());

        $snapshot = $provisioner->snapshot('team', 1);
        $this->assertSame(['projects' => true, 'tasks' => false], $snapshot->entitlements);
        $this->assertSame(['limit_value' => 3, 'is_unlimited' => false], $snapshot->limits['workspaces']);
        // Zero is a hard zero, distinct from unlimited.
        $this->assertSame(['limit_value' => 0, 'is_unlimited' => false], $snapshot->limits['storage_bytes']);
        $this->assertSame(['limit_value' => 0, 'is_unlimited' => true], $snapshot->limits['organization_members']);
        $this->assertFalse($provisioner->latestPublished('team') !== null);

        $this->expectProvisioning('unknown_module', fn () => $provisioner->setModuleEntitlement('team', 1, 'not-a-module', true));
        $this->expectProvisioning('unknown_resource_key', fn () => $provisioner->setLimit('team', 1, 'bandwidth', 1));
        $this->expectProvisioning('limit_invalid', fn () => $provisioner->setLimit('team', 1, 'workspaces', -5));
        $this->assertSame(
            ['workspaces', 'organization_members', 'workspace_members', 'storage_bytes'],
            PlanResourceCatalog::keys(),
        );
    }

    public function test_published_versions_are_immutable_and_republish_is_a_noop(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);
        $provisioner->createDraftVersion('team', 1, 5);
        $provisioner->setModuleEntitlement('team', 1, 'projects', true);
        $provisioner->setLimit('team', 1, 'workspaces', 3);

        $published = $provisioner->publish('team', 1);
        $publishedAt = $published->published_at;

        // Republish: identical snapshot, original timestamp preserved.
        $again = $provisioner->publish('team', 1);
        $this->assertSame($publishedAt->toIso8601String(), $again->published_at->toIso8601String());

        // Every write path refuses published content.
        $this->expectProvisioning('plan_version_immutable', fn () => $provisioner->updateDraftGrace('team', 1, 9));
        $this->expectProvisioning('plan_version_immutable', fn () => $provisioner->setModuleEntitlement('team', 1, 'tasks', true));
        $this->expectProvisioning('plan_version_immutable', fn () => $provisioner->setLimit('team', 1, 'workspaces', 9));
        $this->expectProvisioning('plan_version_drift', fn () => $provisioner->createDraftVersion('team', 1, 9));

        // Model-layer guards refuse direct mutation as well.
        $this->expectProvisioning('plan_version_immutable', function () use ($published): void {
            $published->forceFill(['grace_days' => 9])->save();
        });
        $this->expectProvisioning('plan_version_immutable', function () use ($published): void {
            PlanModuleEntitlement::create([
                'plan_version_id' => $published->id,
                'module_id' => DB::table('core_modules')->where('key', 'tasks')->value('id'),
                'is_allowed' => true,
            ]);
        });
        $this->expectProvisioning('plan_version_immutable', function () use ($published): void {
            $published->delete();
        });

        $snapshot = $provisioner->latestPublished('team');
        $this->assertSame(5, $snapshot->graceDays);
        $this->assertSame(['projects' => true], $snapshot->entitlements);
        $this->assertSame(['limit_value' => 3, 'is_unlimited' => false], $snapshot->limits['workspaces']);
    }

    public function test_composite_keys_prevent_duplicate_rows_at_the_database_level(): void
    {
        $provisioner = app(PlanProvisioner::class);
        $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);
        $version = $provisioner->createDraftVersion('team', 1);
        $moduleId = DB::table('core_modules')->where('key', 'projects')->value('id');

        $provisioner->setModuleEntitlement('team', 1, 'projects', true);
        try {
            DB::table('core_plan_module_entitlements')->insert([
                'plan_version_id' => $version->id, 'module_id' => $moduleId, 'is_allowed' => false,
            ]);
            $this->fail('Composite primary key must reject duplicate entitlements.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }

        $provisioner->setLimit('team', 1, 'workspaces', 1);
        try {
            DB::table('core_plan_limits')->insert([
                'plan_version_id' => $version->id, 'resource_key' => 'workspaces', 'limit_value' => 2, 'is_unlimited' => false,
            ]);
            $this->fail('Composite primary key must reject duplicate limits.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_provisioning_has_no_subscription_activation_or_rbac_side_effects(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $rolesBefore = ScopedRole::count();

        $provisioner = app(PlanProvisioner::class);
        $provisioner->createPlan('team', 'Team', CorePlan::AUDIENCE_ORGANIZATION);
        $provisioner->createDraftVersion('team', 1, 30);
        $provisioner->setModuleEntitlement('team', 1, 'projects', true);
        $provisioner->publish('team', 1);

        // No workspace module activation, no RBAC grants.
        $this->assertSame(0, WorkspaceModule::count());
        $this->assertSame($rolesBefore, ScopedRole::count());

        // The C4 production gate is unchanged: a plan ALLOWING a
        // module grants nothing by itself (C5-3 owns evaluation).
        $gate = app(ModuleEntitlementGate::class);
        $this->assertInstanceOf(UnavailableModuleEntitlementGate::class, $gate);
        $this->assertFalse($gate->isEntitled($workspace, 'projects'));
    }

    private function expectProvisioning(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Provisioning must be rejected with [{$code}].");
        } catch (PlanProvisioningException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
