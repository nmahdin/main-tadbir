<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * Stage C3-2 — organization lifecycle platform permissions and
 * HTTP APIs over the C3-1 domain service.
 */
class PlatformOrganizationLifecycleApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
    }

    public function test_permission_matrix_separates_manage_status_end_and_restore(): void
    {
        $primary = $this->primary();

        // manage_status: suspend/reactivate only.
        $manager = $this->actorWith(['platform.organizations.manage_status'], 'lc.manager');
        [$orgA] = $this->organization('Matrix A');
        Sanctum::actingAs($manager);
        $this->postJson($this->url($orgA, 'suspend'), $this->payload('Freeze', $orgA))->assertOk()
            ->assertJsonPath('data.status', 'suspended');
        $this->postJson($this->url($orgA, 'reactivate'), $this->payload('Unfreeze', $orgA))->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->postJson($this->url($orgA, 'end'), $this->payload('End', $orgA))
            ->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        $this->postJson($this->url($orgA, 'restore'), $this->payload('Restore', $orgA))
            ->assertForbidden();

        // end: terminate only.
        $ender = $this->actorWith(['platform.organizations.end'], 'lc.ender');
        [$orgB] = $this->organization('Matrix B');
        Sanctum::actingAs($ender);
        $this->postJson($this->url($orgB, 'suspend'), $this->payload('Freeze', $orgB))->assertForbidden();
        $this->postJson($this->url($orgB, 'end'), $this->payload('Terminate', $orgB))->assertOk()
            ->assertJsonPath('data.status', 'ended');

        // restore: revive ended only — no suspend, no end.
        Sanctum::actingAs($primary);
        [$orgC] = $this->organization('Matrix C');
        $this->postJson($this->url($orgC, 'end'), $this->payload('Terminate', $orgC))->assertOk();
        $restorer = $this->actorWith(['platform.organizations.restore'], 'lc.restorer');
        Sanctum::actingAs($restorer);
        $this->postJson($this->url($orgC, 'suspend'), $this->payload('Freeze', $orgC))->assertForbidden();
        $this->postJson($this->url($orgC, 'end'), $this->payload('End again', $orgC))->assertForbidden();
        $this->postJson($this->url($orgC, 'restore'), $this->payload('Revive', $orgC))->assertOk()
            ->assertJsonPath('data.status', 'active');

        // view: read-only.
        $viewer = $this->actorWith(['platform.organizations.view'], 'lc.viewer');
        Sanctum::actingAs($viewer);
        $this->getJson("/api/v1/platform/organizations/{$orgA->id}")->assertOk();
        $this->postJson($this->url($orgA, 'suspend'), $this->payload('Freeze', $orgA))->assertForbidden();
    }

    public function test_primary_receives_c3_permissions_only_through_explicit_provisioning(): void
    {
        // Simulate a pre-C3 deployment: protected role holding
        // exactly the frozen C2 permission set.
        $c2Keys = [
            'platform.admins.view', 'platform.admins.manage', 'platform.users.view',
            'platform.users.manage_status', 'platform.organizations.view', 'platform.audit.view',
        ];
        $role = PlatformRole::create([
            'key' => PlatformRoleProvisioner::PRIMARY_ROLE_KEY,
            'name' => 'Primary Administrator',
            'is_protected' => true,
        ]);
        $role->permissions()->attach(ScopedPermission::whereIn('key', $c2Keys)->pluck('id'));

        // Catalog synchronization registers keys; it grants nothing.
        PermissionCatalog::sync();
        $this->assertEqualsCanonicalizing($c2Keys, $role->permissions()->pluck('key')->all());

        // Explicit provisioning performs the reviewed expansion,
        // and repeating it is idempotent.
        $provisioner = app(PlatformRoleProvisioner::class);
        $upgraded = $provisioner->ensurePrimaryAdministrator();
        $this->assertEqualsCanonicalizing(
            PlatformRoleProvisioner::primaryPermissions(),
            $upgraded->permissions()->pluck('key')->all(),
        );
        $this->assertEqualsCanonicalizing(
            ['platform.organizations.manage_status', 'platform.organizations.end', 'platform.organizations.restore'],
            collect($upgraded->permissions()->pluck('key')->all())
                ->diff($c2Keys)->values()->all(),
        );
        $provisioner->ensurePrimaryAdministrator();
        $this->assertSame(9, $role->permissions()->count());
        $this->assertSame(1, PlatformRole::count());
    }

    public function test_full_transition_contract_through_http(): void
    {
        $primary = $this->primary();
        [$organization] = $this->organization('Contract Org');

        Sanctum::actingAs($primary);

        $this->postJson($this->url($organization, 'suspend'), $this->payload('Internal fraud review', $organization))
            ->assertOk()->assertJsonPath('data.status', 'suspended')->assertJsonPath('data.status_version', 2)
            ->assertDontSee('Internal fraud review', false);

        // Duplicate transition.
        $this->postJson($this->url($organization, 'suspend'), $this->payload('Again', $organization))
            ->assertStatus(409)->assertJsonPath('code', 'invalid_transition');

        // Stale version is reported separately from legality.
        $this->postJson($this->url($organization, 'reactivate'), ['reason' => 'Stale', 'status_version' => 1])
            ->assertStatus(409)->assertJsonPath('code', 'stale_version');

        $this->postJson($this->url($organization, 'reactivate'), $this->payload('Cleared', $organization))
            ->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('data.status_version', 3);

        $this->postJson($this->url($organization, 'end'), $this->payload(' wound up', $organization))
            ->assertOk()->assertJsonPath('data.status', 'ended');

        // Ended cannot use ordinary reactivation; restore only.
        $this->postJson($this->url($organization, 'reactivate'), $this->payload('Wrong door', $organization))
            ->assertStatus(409)->assertJsonPath('code', 'invalid_transition');
        $this->postJson($this->url($organization, 'restore'), $this->payload('New ownership', $organization))
            ->assertOk()->assertJsonPath('data.status', 'active');

        // End from suspended is legal.
        $this->postJson($this->url($organization, 'suspend'), $this->payload('Freeze again', $organization))->assertOk();
        $this->postJson($this->url($organization, 'end'), $this->payload('Final', $organization))
            ->assertOk()->assertJsonPath('data.status', 'ended');

        // Validation: missing reason, blank reason, missing version.
        $this->postJson($this->url($organization, 'restore'), ['status_version' => 99])->assertStatus(422);
        // Blank reason: framework validation 422 (the domain
        // reason_required code covers the service-level path,
        // proven in the C3-1 suite).
        $this->postJson($this->url($organization, 'restore'), ['reason' => '   ', 'status_version' => 7])
            ->assertStatus(422);
        $this->postJson($this->url($organization, 'restore'), ['reason' => 'No version'])->assertStatus(422);

        // Unknown organization.
        $this->postJson('/api/v1/platform/organizations/999999/suspend', ['reason' => 'x', 'status_version' => 1])
            ->assertNotFound();

        // The audit trail holds actor, states, reason, version.
        $audit = AuditLog::where('action', 'organization.ended')->latest('id')->firstOrFail();
        $this->assertSame($primary->id, (int) $audit->actor_user_id);
        $this->assertSame('Final', $audit->summary['reason']);
        $this->assertSame('ended', $audit->summary['new_status']);
    }

    public function test_unauthenticated_requests_are_401(): void
    {
        [$organization] = $this->organization('No Auth Org');

        $this->postJson($this->url($organization, 'suspend'), ['reason' => 'x', 'status_version' => 1])
            ->assertUnauthorized();
        $this->getJson("/api/v1/platform/organizations/{$organization->id}")->assertUnauthorized();
    }

    public function test_legacy_admin_and_organization_owner_are_denied(): void
    {
        [$organization, , $creator] = $this->organization('Owner Org');
        $legacyRole = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(Permission::query()->pluck('id'));
        $legacy = User::factory()->create(['role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);

        Sanctum::actingAs($creator);
        $this->postJson($this->url($organization, 'suspend'), $this->payload('Owner attempt', $organization))
            ->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        $this->getJson("/api/v1/platform/organizations/{$organization->id}")->assertForbidden();

        Sanctum::actingAs($legacy);
        $this->postJson($this->url($organization, 'suspend'), $this->payload('Legacy attempt', $organization))
            ->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        $this->assertSame('active', $organization->fresh()->status);
    }

    public function test_admin_visibility_privacy_and_preservation(): void
    {
        $primary = $this->primary();
        [$organization, $workspace, $creator] = $this->organization('Privacy Org');
        $membershipsBefore = OrganizationMembership::where('organization_id', $organization->id)->count();
        $workspaceMembershipsBefore = WorkspaceMembership::where('workspace_id', $workspace->id)->count();

        Sanctum::actingAs($primary);
        $this->postJson($this->url($organization, 'end'), $this->payload('Confidential insolvency process', $organization))
            ->assertOk();

        // Authorized admin detail: lifecycle metadata, no reason,
        // no workspace operational records.
        $viewer = $this->actorWith(['platform.organizations.view'], 'lc.privacy.viewer');
        Sanctum::actingAs($viewer);
        $detail = $this->getJson("/api/v1/platform/organizations/{$organization->id}")->assertOk()
            ->assertJsonPath('data.status', 'ended')
            ->assertJsonPath('data.status_version', 2)
            ->assertJsonMissingPath('data.reason');
        $detail->assertDontSee('Confidential insolvency process', false);
        $this->assertArrayNotHasKey('workspaces', $detail->json('data'));

        // Members get the generic operational wall only.
        Sanctum::actingAs($creator);
        $memberResponse = $this->getJson("/api/v1/core/organizations/{$organization->id}")->assertForbidden();
        $memberResponse->assertDontSee('Confidential insolvency process', false);
        $this->getJson("/api/v1/core/workspaces/{$workspace->id}")->assertForbidden();

        // Everything is preserved.
        $this->assertSame($membershipsBefore, OrganizationMembership::where('organization_id', $organization->id)->count());
        $this->assertSame($workspaceMembershipsBefore, WorkspaceMembership::where('workspace_id', $workspace->id)->count());
        $this->assertTrue($workspace->fresh()->exists);
    }

    public function test_audit_failure_rolls_back_http_transition(): void
    {
        $primary = $this->primary();
        [$organization] = $this->organization('Rollback Org');

        AuditLog::creating(function (): void {
            throw new RuntimeException('audit storage unavailable (injected)');
        });

        Sanctum::actingAs($primary);
        $this->postJson($this->url($organization, 'suspend'), $this->payload('Must not persist', $organization))
            ->assertServerError();

        $fresh = $organization->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertSame(1, (int) $fresh->status_version);
    }

    /**
     * @return array{0: Organization, 1: \App\Core\Workspaces\Workspace, 2: User}
     */
    private function organization(string $name): array
    {
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, $name.' '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();

        return [$organization, $workspace, $creator];
    }

    private function primary(): User
    {
        return $this->actorWith(null, 'lc.primary');
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
            $role = PlatformRole::create(['key' => 'lc_'.uniqid(), 'name' => 'LC']);
            $role->permissions()->attach(ScopedPermission::whereIn('key', $permissionKeys)->pluck('id'));
        }
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        return $user;
    }

    private function url(Organization $organization, string $operation): string
    {
        return "/api/v1/platform/organizations/{$organization->id}/{$operation}";
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $reason, Organization $organization): array
    {
        return ['reason' => $reason, 'status_version' => (int) $organization->fresh()->status_version];
    }
}
