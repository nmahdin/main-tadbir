<?php

namespace Tests\Feature\Projects;

use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C5-3 — Projects HTTP read/write matrix across subscription
 * states, driven end-to-end by real versioned plans/subscriptions
 * (the pilot bypass is deleted). Records must survive every
 * transition; only operational access changes.
 */
class ProjectsSubscriptionAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        foreach (['http-personal' => 'personal', 'http-org' => 'organization'] as $key => $audience) {
            $plans->createPlan($key, ucfirst($key), $audience);
            $plans->createDraftVersion($key, 1, 7); // 7-day grace
            $plans->setModuleEntitlement($key, 1, 'projects', true);
            $plans->publish($key, 1);
        }

        $this->admin = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $this->admin->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);
    }

    public function test_full_subscription_state_matrix_for_personal_workspace(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $this->enableProjects($workspace, $owner);
        Sanctum::actingAs($owner);
        $headers = ['X-Workspace-Id' => (string) $workspace->id];

        // Missing subscription: no reads, no writes.
        $this->travelTo(CarbonImmutable::parse('2026-03-01T00:00:00Z'));
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")->assertForbidden();
        $this->postJson('/api/v1/projects', ['name' => 'Nope', 'workspace_id' => $workspace->id])->assertForbidden();

        $subscription = $this->assign($workspace, 'http-personal', '2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z');

        // Active: full RBAC-controlled access.
        $id = $this->postJson('/api/v1/projects', ['name' => 'Matrix', 'status' => 'active', 'workspace_id' => $workspace->id])
            ->assertCreated()->json('data.id');
        $this->getJson("/api/v1/projects/{$id}", $headers)->assertOk();
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'Matrix 2'], $headers)->assertOk();

        // Grace: still full access.
        $this->travelTo(CarbonImmutable::parse('2026-07-03T00:00:00Z'));
        $this->getJson("/api/v1/projects/{$id}", $headers)->assertOk();
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'Matrix 3'], $headers)->assertOk();

        // Expired: safe reads only; every write denied; data preserved.
        $this->travelTo(CarbonImmutable::parse('2026-08-01T00:00:00Z'));
        $this->getJson("/api/v1/projects/{$id}", $headers)->assertOk()->assertJsonPath('data.name', 'Matrix 3');
        $this->getJson("/api/v1/projects?workspace_id={$workspace->id}")->assertOk();
        $this->postJson('/api/v1/projects', ['name' => 'Late', 'workspace_id' => $workspace->id])->assertForbidden();
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'Hijack'], $headers)->assertForbidden();
        $this->deleteJson("/api/v1/projects/{$id}", [], $headers)->assertForbidden();
        $this->assertDatabaseHas('projects', ['id' => $id, 'name' => 'Matrix 3', 'workspace_id' => $workspace->id]);

        // Renewal restores writes; the module was never re-enabled
        // by anyone and the record kept its identity throughout.
        app(SubscriptionService::class)->renew($this->admin, $subscription,
            CarbonImmutable::parse('2027-09-01T00:00:00Z'), CarbonImmutable::parse('2026-08-01T00:00:00Z'), 'renewal', 'corr-http-renew', 1);
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'Renewed'], $headers)->assertOk();
        $this->assertSame(1, WorkspaceModule::query()->where('workspace_id', $workspace->id)->where('status', 'enabled')->count());
    }

    public function test_suspended_organization_denies_despite_active_subscription(): void
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Http Org '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $this->enableProjects($workspace, $creator);
        $this->assign($organization, 'http-org', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');

        $this->travelTo(CarbonImmutable::parse('2026-03-01T00:00:00Z'));
        Sanctum::actingAs($creator);
        $id = $this->postJson('/api/v1/projects', ['name' => 'Org', 'status' => 'active', 'workspace_id' => $workspace->id])
            ->assertCreated()->json('data.id');

        $organization->forceFill(['status' => 'suspended'])->save();
        $this->getJson("/api/v1/projects/{$id}", ['X-Workspace-Id' => (string) $workspace->id])->assertForbidden();
        $this->patchJson("/api/v1/projects/{$id}", ['name' => 'No'], ['X-Workspace-Id' => (string) $workspace->id])->assertForbidden();
        $this->assertDatabaseHas('projects', ['id' => $id, 'workspace_id' => $workspace->id]);
    }

    private function assign(mixed $owner, string $planKey, string $starts, string $expires): CoreSubscription
    {
        return app(SubscriptionService::class)->assignInitial($this->admin, $owner, $planKey, 1,
            CarbonImmutable::parse($starts), CarbonImmutable::parse($expires), 'http matrix fixture', 'corr-'.uniqid());
    }

    private function enableProjects(mixed $workspace, User $actor): void
    {
        WorkspaceModule::create([
            'workspace_id' => $workspace->id,
            'module_id' => CoreModule::query()->where('key', 'projects')->sole()->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
            'enabled_at' => now(),
            'enabled_by_user_id' => $actor->id,
        ]);
    }
}
