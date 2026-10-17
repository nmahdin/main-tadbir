<?php

namespace Tests\Feature\Core;

use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Plans\PlanProvisioner;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Platform subscription administration APIs (Stage C5-4).
 *
 * Covers the authorization matrix (unauthenticated, unrelated
 * platform permission, legacy admin, organization owner/workspace
 * manager, suspended platform actor), assign/read/renew/history,
 * plan-change preview + confirm over HTTP, stable error codes,
 * and the rule that responses never expose mutation reasons or
 * operational workspace data.
 */
class PlatformSubscriptionApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Organization $org;

    private Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        file_put_contents('/tmp/progress.txt', "A\n", FILE_APPEND);
        PermissionCatalog::sync();
        file_put_contents('/tmp/progress.txt', "B\n", FILE_APPEND);
        app(ModuleRegistrySynchronizer::class)->sync();

        $plans = app(PlanProvisioner::class);
        $plans->createPlan('growth', 'Growth', 'organization');
        $plans->createDraftVersion('growth', 1, 7);
        $plans->setModuleEntitlement('growth', 1, 'projects', true);
        $plans->setLimit('growth', 1, 'workspaces', 10);
        $plans->publish('growth', 1);
        $plans->createDraftVersion('growth', 2, 0);
        $plans->setModuleEntitlement('growth', 2, 'projects', true);
        $plans->setModuleEntitlement('growth', 2, 'crm', true);
        $plans->setLimit('growth', 2, 'workspaces', 10);
        $plans->publish('growth', 2);

        file_put_contents('/tmp/progress.txt', "C\n", FILE_APPEND);
        $this->admin = $this->actorWith(null, 'psa_admin');
        file_put_contents('/tmp/progress.txt', "D\n", FILE_APPEND);
        $creator = User::factory()->create(['username' => 'psa_owner']);
        $this->org = app(\App\Core\Organizations\OrganizationProvisioner::class)->create($creator, 'PSA Org');
        $this->workspace = $this->org->workspaces()->where('is_default', true)->firstOrFail();
    }

    public function test_unauthenticated_and_unauthorized_actors_are_denied(): void
    {
        $url = "/api/v1/platform/organizations/{$this->org->id}/subscription";
        file_put_contents('/tmp/progress.txt', "E\n", FILE_APPEND);
        $this->getJson($url)->assertUnauthorized();
        file_put_contents('/tmp/progress.txt', "F\n", FILE_APPEND);

        Sanctum::actingAs(User::factory()->create(['username' => 'psa_plain', 'status' => 'active']));
        $this->getJson($url)->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        $this->postJson($url, $this->assignPayload())->assertForbidden();

        // A platform actor without the subscription permission is denied.
        Sanctum::actingAs($this->actorWith(['platform.users.view'], 'psa_users_viewer'));
        $this->getJson($url)->assertForbidden()->assertJsonPath('code', 'platform_forbidden');

        // Legacy Admin obtains nothing from the legacy role system.
        $legacyRole = \App\Models\Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(\App\Models\Permission::query()->pluck('id'));
        $legacy = User::factory()->create(['username' => 'psa_legacy', 'role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);
        Sanctum::actingAs($legacy);
        $this->getJson($url)->assertForbidden()->assertJsonPath('code', 'platform_forbidden');

        // Organization owner / workspace manager: no implicit authority.
        $owner = $this->org->creator;
        Sanctum::actingAs($owner);
        $this->getJson($url)->assertForbidden();
        $this->postJson($url, $this->assignPayload())->assertForbidden();

        // Suspended platform actor denied even with the permission.
        $suspended = $this->actorWith(null, 'psa_suspended');
        $suspended->forceFill(['status' => 'suspended'])->save();
        Sanctum::actingAs($suspended->fresh());
        $this->getJson($url)->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
    }

    public function test_assign_show_renew_and_history_flow(): void
    {
        Sanctum::actingAs($this->admin);
        $url = "/api/v1/platform/organizations/{$this->org->id}/subscription";

        $this->getJson($url)->assertNotFound()->assertJsonPath('code', 'subscription_not_found');

        $created = $this->postJson($url, $this->assignPayload())->assertCreated();
        $subscriptionId = $created->json('data.id');
        $created->assertJsonPath('data.state', 'active')
            ->assertJsonPath('data.plan.key', 'growth')
            ->assertJsonPath('data.plan.version', 1)
            ->assertJsonPath('data.status_version', 1);
        $this->assertArrayNotHasKey('reason', $created->json('data'));

        $this->getJson($url)->assertOk()->assertJsonPath('data.id', $subscriptionId);
        // The org-workspace view resolves the same organization subscription.
        $this->getJson("/api/v1/platform/workspaces/{$this->workspace->id}/subscription")
            ->assertOk()->assertJsonPath('data.id', $subscriptionId);

        // Duplicate assignment -> 409.
        $this->postJson($url, $this->assignPayload('corr-2'))
            ->assertStatus(409)->assertJsonPath('code', 'subscription_exists');

        // Renewal requires the optimistic version.
        $this->postJson("/api/v1/platform/subscriptions/{$subscriptionId}/renew", [
            'expires_at' => '2026-12-01T00:00:00Z',
            'reason' => 'annual renewal',
            'correlation_id' => 'renew-1',
            'status_version' => 99,
        ])->assertStatus(409)->assertJsonPath('code', 'subscription_stale_version');

        $this->postJson("/api/v1/platform/subscriptions/{$subscriptionId}/renew", [
            'expires_at' => '2026-12-01T00:00:00Z',
            'reason' => 'annual renewal',
            'correlation_id' => 'renew-1',
        ])->assertUnprocessable(); // missing status_version rejected by validation

        $renewed = $this->postJson("/api/v1/platform/subscriptions/{$subscriptionId}/renew", [
            'expires_at' => '2026-12-01T00:00:00Z',
            'reason' => 'annual renewal',
            'correlation_id' => 'renew-1',
            'status_version' => 1,
        ])->assertOk();
        $renewed->assertJsonPath('data.status_version', 2)
            ->assertJsonPath('data.expires_at', '2026-12-01T00:00:00+00:00');

        // History: operations visible, reasons never exposed.
        $history = $this->getJson("/api/v1/platform/subscriptions/{$subscriptionId}/history")->assertOk();
        $entries = $history->json('data');
        $this->assertSame(['initial', 'renewal'], array_column($entries, 'operation'));

        foreach ($entries as $entry) {
            $this->assertArrayNotHasKey('reason', $entry);
        }
    }

    public function test_invalid_assignment_payloads_map_to_stable_errors(): void
    {
        Sanctum::actingAs($this->admin);
        $url = "/api/v1/platform/organizations/{$this->org->id}/subscription";

        $payload = $this->assignPayload();
        unset($payload['reason']);
        $this->postJson($url, $payload)->assertUnprocessable();

        $this->postJson($url, array_merge($this->assignPayload('corr-x'), ['plan_key' => 'missing-plan']))
            ->assertUnprocessable()->assertJsonPath('code', 'plan_version_not_published');

        $plans = app(PlanProvisioner::class);
        $plans->createPlan('personal-only', 'Personal Only', 'personal');
        $plans->createDraftVersion('personal-only', 1, 0);
        $plans->publish('personal-only', 1);

        $this->postJson($url, array_merge($this->assignPayload('corr-y'), ['plan_key' => 'personal-only']))
            ->assertUnprocessable()->assertJsonPath('code', 'subscription_plan_mismatch');
    }

    public function test_plan_change_preview_and_confirmation_over_http(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/v1/platform/organizations/{$this->org->id}/subscription", $this->assignPayload())->assertCreated();
        $subscription = CoreSubscription::query()->sole();

        $preview = $this->postJson("/api/v1/platform/subscriptions/{$subscription->id}/plan-change-preview", [
            'plan_key' => 'growth',
            'plan_version' => 2,
        ])->assertOk();
        $preview->assertJsonPath('data.confirmable', true)
            ->assertJsonPath('data.current_plan.version', 1)
            ->assertJsonPath('data.target_plan.version', 2)
            ->assertJsonPath('data.gaining_modules.0', 'crm');
        $token = $preview->json('data.confirmation_token');
        $effectiveAt = $preview->json('data.effective_at');

        $confirmed = $this->postJson("/api/v1/platform/subscriptions/{$subscription->id}/plan-change", [
            'plan_key' => 'growth',
            'plan_version' => 2,
            'effective_at' => $effectiveAt,
            'confirmation_token' => $token,
            'status_version' => 1,
            'reason' => 'upgrade',
            'correlation_id' => 'change-1',
        ])->assertOk();
        $confirmed->assertJsonPath('data.plan.version', 2)->assertJsonPath('data.status_version', 2);

        // Re-using the consumed token against the new state is stale.
        $this->postJson("/api/v1/platform/subscriptions/{$subscription->id}/plan-change", [
            'plan_key' => 'growth',
            'plan_version' => 2,
            'effective_at' => $effectiveAt,
            'confirmation_token' => $token,
            'status_version' => 2,
            'reason' => 'again',
            'correlation_id' => 'change-2',
        ])->assertStatus(409);

        $history = $this->getJson("/api/v1/platform/subscriptions/{$subscription->id}/history")->assertOk();
        $this->assertSame(['initial', 'plan_change'], array_column($history->json('data'), 'operation'));
    }

    private function assignPayload(string $correlation = 'corr-1'): array
    {
        return [
            'plan_key' => 'growth',
            'plan_version' => 1,
            'starts_at' => '2026-05-01T00:00:00Z',
            'expires_at' => '2026-07-01T00:00:00Z',
            'reason' => 'initial provisioning',
            'correlation_id' => $correlation,
        ];
    }

    /**
     * @param  list<string>|null  $permissionKeys  null = protected primary role
     */
    private function actorWith(?array $permissionKeys, string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);

        if ($permissionKeys === null) {
            $role = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        } else {
            $role = PlatformRole::create(['key' => 'ps_'.uniqid(), 'name' => 'PS']);
            $role->permissions()->attach(ScopedPermission::whereIn('key', $permissionKeys)->pluck('id'));
        }

        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        return $user;
    }
}
