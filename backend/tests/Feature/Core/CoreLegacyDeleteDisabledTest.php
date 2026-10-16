<?php

namespace Tests\Feature\Core;

use App\Core\Identity\AccountLifecycle;
use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C1-H1 — legacy user hard delete is disabled.
 *
 * DELETE /api/v1/users/{user} keeps its route and middleware, but
 * must reject every authorized request with 409
 * `account_deletion_disabled` and must never delete or mutate the
 * target, their memberships, or their business history. Account
 * retirement is exclusively the Core lifecycle's job.
 */
class CoreLegacyDeleteDisabledTest extends TestCase
{
    use RefreshDatabase;

    public function test_authorized_administrator_receives_controlled_rejection_and_target_is_unchanged(): void
    {
        $target = User::factory()->create(['status' => 'active', 'name' => 'Keep Me']);

        Sanctum::actingAs($this->admin());
        $this->deleteJson("/api/v1/users/{$target->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'account_deletion_disabled');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'status' => 'active', 'name' => 'Keep Me']);
    }

    public function test_suspended_and_deactivated_users_cannot_be_hard_deleted(): void
    {
        $admin = $this->admin();
        $lifecycle = app(AccountLifecycle::class);
        $suspended = User::factory()->create(['status' => 'active']);
        $lifecycle->suspend($admin, $suspended);
        $deactivated = User::factory()->create(['status' => 'active']);
        $lifecycle->deactivate($admin, $deactivated);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/v1/users/{$suspended->id}")->assertStatus(409);
        $this->deleteJson("/api/v1/users/{$deactivated->id}")->assertStatus(409);

        $this->assertSame('suspended', $suspended->fresh()->status);
        $this->assertSame('deactivated', $deactivated->fresh()->status);
    }

    public function test_memberships_projects_and_history_remain_intact_after_rejected_delete(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['status' => 'active']);
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $target->id,
            'status' => MembershipStatus::Active,
        ]);
        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );
        // projects.user_id is a legacy ownership column that is not
        // mass-assignable on the modern model — insert directly.
        $projectId = \Illuminate\Support\Facades\DB::table('projects')->insertGetId([
            'name' => 'Target Project',
            'user_id' => $target->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $activity = ActivityLog::create([
            'user_id' => $target->id,
            'type' => 'test',
            'action' => 'history entry',
        ]);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/v1/users/{$target->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'account_deletion_disabled');

        // No cascade effects of any kind.
        $this->assertDatabaseHas('users', ['id' => $target->id]);
        $this->assertTrue($membership->fresh()->isActive());
        $this->assertDatabaseHas('projects', ['id' => $projectId, 'user_id' => $target->id]);
        $this->assertDatabaseHas('activity_logs', ['id' => $activity->id]);
    }

    public function test_unauthenticated_and_unauthorized_requests_still_hit_existing_middleware(): void
    {
        $target = User::factory()->create(['status' => 'active']);

        $this->deleteJson("/api/v1/users/{$target->id}")->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create(['status' => 'active']));
        $this->deleteJson("/api/v1/users/{$target->id}")->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $target->id]);
    }

    public function test_lifecycle_deactivate_continues_to_work_after_delete_is_disabled(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $target = User::factory()->create(['status' => 'active']);
        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $target->id,
            'status' => MembershipStatus::Active,
        ]);
        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/v1/users/{$target->id}")->assertStatus(409);
        $this->postJson("/api/v1/users/{$target->id}/account-lifecycle", ['action' => 'deactivate'])
            ->assertOk()
            ->assertJsonPath('data.status', 'deactivated');
        $this->assertSame(MembershipStatus::Ended, $membership->fresh()->status);
        // History rows preserved by the lifecycle path.
        $this->assertDatabaseHas('workspace_memberships', ['id' => $membership->id]);
    }

    private function admin(): User
    {
        $role = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        foreach (['users.delete', 'users.view', 'users.edit', 'users.status'] as $key) {
            $role->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
                ['key' => $key],
                ['label' => $key, 'category' => 'tests'],
            ));
        }

        return User::factory()->create(['role_id' => $role->id, 'role_key' => 'admin', 'status' => 'active']);
    }
}
