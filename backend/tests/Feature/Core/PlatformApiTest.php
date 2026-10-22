<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditWriter;
use App\Core\Organizations\Organization;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C2-3 — Platform Administration HTTP APIs.
 *
 * Controllers must stay thin: every rule asserted here is enforced
 * by the C2-2 services; these tests prove the HTTP contract
 * (authN/Z matrix, stable error codes, pagination, versioning)
 * and that no legacy privilege leaks into the platform plane.
 */
class PlatformApiTest extends TestCase
{
    use RefreshDatabase;

    private PlatformRole $primaryRole;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        $this->primaryRole = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
    }

    public function test_authentication_and_permission_denial_matrix(): void
    {
        $endpoints = [
            ['GET', '/api/v1/platform/roles'],
            ['POST', '/api/v1/platform/roles'],
            ['GET', '/api/v1/platform/assignments'],
            ['POST', '/api/v1/platform/assignments'],
            ['GET', '/api/v1/platform/users'],
            ['GET', '/api/v1/platform/organizations'],
            ['GET', '/api/v1/platform/audit-logs'],
        ];

        foreach ($endpoints as [$method, $uri]) {
            $this->call($method, $uri)->assertUnauthorized();
        }

        $plain = User::factory()->create(['status' => 'active']);
        Sanctum::actingAs($plain);
        foreach ($endpoints as [$method, $uri]) {
            $this->call($method, $uri)->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        }
    }

    public function test_legacy_admin_without_platform_assignment_has_no_platform_authority(): void
    {
        $legacyRole = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
            ['key' => 'users.view'],
            ['label' => 'users.view', 'category' => 'tests'],
        ));
        $legacyAdmin = User::factory()->create(['role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);

        Sanctum::actingAs($legacyAdmin);
        $this->getJson('/api/v1/platform/roles')->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        $this->getJson('/api/v1/platform/users')->assertForbidden();
        $this->getJson('/api/v1/platform/audit-logs')->assertForbidden();
    }

    public function test_suspended_platform_user_is_denied(): void
    {
        $primary = $this->makePrimary();
        $primary->forceFill(['status' => 'suspended'])->save();

        Sanctum::actingAs($primary->fresh());
        $this->getJson('/api/v1/platform/roles')->assertForbidden();
    }

    public function test_role_crud_and_optimistic_concurrency(): void
    {
        $primary = $this->makePrimary();
        Sanctum::actingAs($primary);

        $this->getJson('/api/v1/platform/roles')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'primary_administrator');

        $created = $this->postJson('/api/v1/platform/roles', [
            'key' => 'support_viewer',
            'name' => 'Support Viewer',
            'permissions' => ['platform.users.view'],
        ])->assertCreated()->assertJsonPath('data.version', 1)->json('data');

        $this->putJson("/api/v1/platform/roles/{$created['id']}", [
            'name' => 'Support Viewer II',
            'permissions' => ['platform.users.view', 'platform.audit.view'],
            'version' => 1,
        ])->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.name', 'Support Viewer II');

        // Stale version is a stable 409 and changes nothing.
        $this->putJson("/api/v1/platform/roles/{$created['id']}", [
            'name' => 'Stale Write',
            'version' => 1,
        ])->assertStatus(409)->assertJsonPath('code', 'platform_role_version_conflict');
        $this->assertSame('Support Viewer II', PlatformRole::find($created['id'])->name);

        // Cross-scope permission keys fail closed with 422.
        $this->postJson('/api/v1/platform/roles', [
            'key' => 'bad_scope', 'name' => 'Bad', 'permissions' => ['workspace.view'],
        ])->assertUnprocessable();
    }

    public function test_protected_primary_role_cannot_be_edited_or_deleted_via_api(): void
    {
        Sanctum::actingAs($this->makePrimary());

        $this->putJson("/api/v1/platform/roles/{$this->primaryRole->id}", [
            'permissions' => ['platform.users.view'],
            'version' => (int) $this->primaryRole->version,
        ])->assertUnprocessable();

        $this->deleteJson("/api/v1/platform/roles/{$this->primaryRole->id}")->assertUnprocessable();
        $this->assertDatabaseHas('platform_roles', ['id' => $this->primaryRole->id]);
    }

    public function test_assignment_grant_revoke_replace_flow_and_history(): void
    {
        $primary = $this->makePrimary();
        $target = User::factory()->create(['status' => 'active']);
        $viewer = $this->roleWith(['platform.users.view'], 'api_viewer');
        $auditor = $this->roleWith(['platform.audit.view'], 'api_auditor');

        Sanctum::actingAs($primary);
        $granted = $this->postJson('/api/v1/platform/assignments', [
            'user_id' => $target->id,
            'platform_role_id' => $viewer->id,
        ])->assertCreated()->json('data');

        // Duplicate active grant is rejected.
        $this->postJson('/api/v1/platform/assignments', [
            'user_id' => $target->id,
            'platform_role_id' => $auditor->id,
        ])->assertUnprocessable();

        // Atomic replacement through HTTP.
        $replaced = $this->postJson("/api/v1/platform/assignments/{$granted['id']}/replace", [
            'platform_role_id' => $auditor->id,
        ])->assertOk()->json('data');
        $this->assertSame($auditor->id, $replaced['role']['id']);

        // Revocation is soft: history remains visible on request.
        $this->postJson("/api/v1/platform/assignments/{$replaced['id']}/revoke")->assertOk();
        $this->assertSame(2, PlatformRoleAssignment::where('user_id', $target->id)->count());
        $this->getJson('/api/v1/platform/assignments?include_revoked=1&user_id='.$target->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/platform/assignments?user_id='.$target->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    public function test_self_modification_and_ceiling_via_http(): void
    {
        $primary = $this->makePrimary();
        Sanctum::actingAs($primary);

        $this->postJson('/api/v1/platform/assignments', [
            'user_id' => $primary->id,
            'platform_role_id' => $this->primaryRole->id,
        ])->assertForbidden();

        $myAssignment = PlatformRoleAssignment::where('user_id', $primary->id)->whereNull('revoked_at')->firstOrFail();
        $this->postJson("/api/v1/platform/assignments/{$myAssignment->id}/revoke")->assertForbidden();
        $this->assertNull($myAssignment->fresh()->revoked_at);
    }

    public function test_final_primary_replacement_rolls_back_via_http(): void
    {
        $primary = $this->makePrimary();
        $manager = $this->actorWith(['platform.admins.manage'], 'api_manager');
        $viewer = $this->roleWith(['platform.users.view'], 'api_demote_target');
        $assignment = PlatformRoleAssignment::where('user_id', $primary->id)->whereNull('revoked_at')->firstOrFail();

        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/platform/assignments/{$assignment->id}/replace", [
            'platform_role_id' => $viewer->id,
        ])->assertUnprocessable();

        $this->assertNull($assignment->fresh()->revoked_at);
        $this->assertSame(1, PlatformRoleAssignment::where('user_id', $primary->id)->whereNull('revoked_at')->count());
    }

    public function test_user_and_organization_listings_are_readonly_paginated_and_minimal(): void
    {
        Organization::create(['name' => 'Acme Org', 'slug' => 'acme-org', 'status' => 'active']);
        User::factory()->count(3)->create(['status' => 'active']);

        $viewer = $this->actorWith(['platform.users.view'], 'api_users_viewer');
        Sanctum::actingAs($viewer);
        $this->getJson('/api/v1/platform/users?per_page=2')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonStructure(['data' => [['id', 'name', 'username', 'status', 'platform_role', 'created_at']], 'meta']);
        // users.view does not imply organizations.view.
        $this->getJson('/api/v1/platform/organizations')->assertForbidden();

        $orgViewer = $this->actorWith(['platform.organizations.view'], 'api_org_viewer');
        Sanctum::actingAs($orgViewer);
        $response = $this->getJson('/api/v1/platform/organizations')->assertOk();
        $response->assertJsonPath('data.0.slug', 'acme-org');
        $this->assertArrayNotHasKey('workspaces', $response->json('data.0'));
    }

    public function test_audit_access_is_permission_controlled_and_masked(): void
    {
        app(AuditWriter::class)->record(null, 'platform.test_event', [
            'password' => 'super-secret-value',
            'note' => 'visible',
        ], 'platform', null, 'user', 1);

        $viewer = $this->actorWith(['platform.users.view'], 'api_no_audit');
        Sanctum::actingAs($viewer);
        $this->getJson('/api/v1/platform/audit-logs')->assertForbidden();

        $auditor = $this->actorWith(['platform.audit.view'], 'api_auditor_full');
        Sanctum::actingAs($auditor);
        $response = $this->getJson('/api/v1/platform/audit-logs?action=platform.test_event')->assertOk();
        $response->assertJsonPath('data.0.summary.password', '***');
        $this->assertStringNotContainsString('super-secret-value', $response->getContent());
    }

    public function test_lifecycle_endpoint_accepts_platform_manage_status_but_not_view_only(): void
    {
        $statusManager = $this->actorWith(['platform.users.manage_status', 'platform.users.view'], 'api_status_manager');
        $target = User::factory()->create(['status' => 'active']);

        Sanctum::actingAs($statusManager);
        $this->postJson("/api/v1/users/{$target->id}/account-lifecycle", ['action' => 'suspend'])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');

        $viewerOnly = $this->actorWith(['platform.users.view'], 'api_status_viewer');
        $other = User::factory()->create(['status' => 'active']);
        Sanctum::actingAs($viewerOnly);
        $this->postJson("/api/v1/users/{$other->id}/account-lifecycle", ['action' => 'suspend'])
            ->assertForbidden();
        $this->assertSame('active', $other->fresh()->status);
    }

    private function makePrimary(): User
    {
        $user = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => $this->primaryRole->id,
        ]);

        return $user;
    }

    /**
     * @param  list<string>  $keys
     */
    private function actorWith(array $keys, string $roleKey): User
    {
        $role = $this->roleWith($keys, $roleKey);
        $user = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => $role->id,
        ]);

        return $user;
    }

    /**
     * @param  list<string>  $keys
     */
    private function roleWith(array $keys, string $roleKey): PlatformRole
    {
        $role = PlatformRole::create(['key' => $roleKey, 'name' => $roleKey, 'is_protected' => false]);
        $role->permissions()->attach(ScopedPermission::whereIn('key', $keys)->pluck('id')->all());

        return $role;
    }
}
