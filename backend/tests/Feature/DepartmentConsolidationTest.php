<?php

namespace Tests\Feature;

use App\Bot\Bale\Automations;
use App\Models\BaleConversation;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\Content;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\WorkspaceRecord;
use App\Services\DamTableAccess;
use App\Services\Organization\DepartmentConsolidation;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepartmentConsolidationTest extends TestCase
{
    use DatabaseMigrations;

    public $mockConsoleOutput = false;

    public function runDatabaseMigrations(): void
    {
        if (! app()->environment('testing') || config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Isolated SQLite only.');
        }
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(fn () => RefreshDatabaseState::$migrated = false);
    }

    private function actor(array $permissions = [], bool $admin = false): User
    {
        if ($admin) {
            $permissions = array_unique([...$permissions, 'departments.view', 'departments.create', 'departments.edit', 'departments.delete', 'departments.manage_members', 'users.view', 'users.edit', 'users.create', 'assets.view', 'assets.manage_access', 'content.view', 'thinktank.create']);
        }
        $key = $admin ? 'admin' : 'department_test_'.Str::random(10);
        $role = Role::firstOrCreate(['key' => $key], ['name' => $key, 'is_active' => true]);
        foreach ($permissions as $permission) {
            $role->permissions()->syncWithoutDetaching(Permission::firstOrCreate(['key' => $permission], ['label' => $permission, 'category' => 'departments'])->id);
        }

        return User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $key]);
    }

    private function legacyTeam(?Department $parent = null, ?User $member = null, string $status = 'active'): int
    {
        SystemSetting::updateOrCreate(['key' => DepartmentConsolidation::KEY], ['value' => ['phase' => 'teams', 'after' => 0]]);
        $id = DB::table('teams')->insertGetId(['name' => 'نام یکسان', 'status' => $status, 'department_id' => $parent?->id, 'created_at' => now(), 'updated_at' => now()]);
        if ($member) {
            DB::table('team_user')->insert(['team_id' => $id, 'user_id' => $member->id, 'role' => 'reviewer', 'joined_at' => now()]);
        }

        return $id;
    }

    private function finish(User $admin): void
    {
        $service = app(DepartmentConsolidation::class);
        for ($i = 0; $i < 100; $i++) {
            if ($service->batch($admin)['phase'] === 'done') {
                return;
            }
        }
        $this->fail('Migration failed to finish.');
    }

    public function test_missing_parent_and_manager_are_validation_errors_not_foreign_key_failures(): void
    {
        Sanctum::actingAs($this->actor(admin: true));
        $department = Department::create(['name' => 'اصلی']);
        $this->putJson('/api/v1/departments/'.$department->id, ['name' => 'تغییر', 'parentId' => 999])->assertUnprocessable()->assertJsonValidationErrors('parentId');
        $this->putJson('/api/v1/departments/'.$department->id, ['managerId' => 999])->assertUnprocessable()->assertJsonValidationErrors('managerId');
        $this->assertSame('اصلی', $department->fresh()->name);
        $this->postJson('/api/v1/departments', ['name' => 'ریشه', 'parentId' => null])->assertCreated()->assertJsonPath('data.parentId', null);
    }

    public function test_self_and_descendant_parent_are_rejected_and_null_clears_parent(): void
    {
        Sanctum::actingAs($this->actor(admin: true));
        $parent = Department::create(['name' => 'والد']);
        $child = Department::create(['name' => 'فرزند', 'parent_id' => $parent->id]);
        foreach ([$parent->id, $child->id] as $id) {
            $this->putJson('/api/v1/departments/'.$parent->id, ['parentId' => $id])->assertUnprocessable()->assertJsonValidationErrors('parentId');
        }
        $this->putJson('/api/v1/departments/'.$child->id, ['parentId' => null])->assertOk()->assertJsonPath('data.parentId', null);
    }

    public function test_partial_update_preserves_real_members_and_omitted_fields(): void
    {
        $admin = $this->actor(admin: true);
        Sanctum::actingAs($admin);
        $member = $this->actor();
        $department = Department::create(['name' => 'اول', 'description' => 'شرح', 'manager_id' => $admin->id]);
        $department->members()->attach($member, ['role' => 'کارشناس', 'joined_at' => now()]);
        $this->putJson('/api/v1/departments/'.$department->id, ['name' => 'دوم'])->assertOk()->assertJsonPath('data.description', 'شرح')->assertJsonPath('data.managerId', (string) $admin->id)->assertJsonPath('data.members.0.role', 'کارشناس');
        $this->assertDatabaseCount('department_user', 1);
        $this->getJson('/api/v1/departments')->assertOk()->assertJsonPath('data.0.members.0.userId', (string) $member->id);
    }

    public function test_membership_is_multiple_and_removal_revokes_primary_fk_grant(): void
    {
        Sanctum::actingAs($this->actor(admin: true));
        $user = $this->actor();
        $a = Department::create(['name' => 'الف']);
        $b = Department::create(['name' => 'ب']);
        $user->update(['department_id' => $a->id]);
        foreach ([$a, $b] as $department) {
            $this->putJson('/api/v1/departments/'.$department->id, ['members' => [['userId' => $user->id]]])->assertOk();
        }
        $this->assertSame(2, Department::forMember($user)->count());
        $this->putJson('/api/v1/departments/'.$a->id, ['members' => []])->assertOk();
        $this->assertNull($user->fresh()->department_id);
        $this->assertFalse(Department::whereKey($a->id)->forMember($user)->exists());
        $this->assertTrue(Department::whereKey($b->id)->forMember($user)->exists());
    }

    public function test_ordinary_department_editor_cannot_change_members_or_manager(): void
    {
        $editor = $this->actor(['departments.edit']);
        Sanctum::actingAs($editor);
        $department = Department::create(['name' => 'اصلی']);
        $this->putJson('/api/v1/departments/'.$department->id, ['name' => 'ویرایش'])->assertOk();
        $this->putJson('/api/v1/departments/'.$department->id, ['members' => [['userId' => $editor->id]]])->assertForbidden();
        $this->putJson('/api/v1/departments/'.$department->id, ['managerId' => $editor->id])->assertForbidden();
    }

    public function test_user_editor_cannot_claim_department_without_membership_permission(): void
    {
        $editor = $this->actor(['users.edit']);
        Sanctum::actingAs($editor);
        $department = Department::create(['name' => 'حساس']);
        $user = $this->actor();
        $this->patchJson('/api/v1/users/'.$user->id, ['departmentId' => $department->id])->assertForbidden();
        $this->assertNull($user->fresh()->department_id);
    }

    public function test_duplicate_department_names_never_resolve_to_an_arbitrary_primary_department(): void
    {
        Sanctum::actingAs($this->actor(admin: true));
        $user = $this->actor();
        Department::create(['name' => 'تکراری']);
        $chosen = Department::create(['name' => 'تکراری']);
        $this->patchJson('/api/v1/users/'.$user->id, ['department' => 'تکراری'])->assertUnprocessable();
        $this->patchJson('/api/v1/users/'.$user->id, ['departmentId' => $chosen->id])->assertOk()->assertJsonPath('data.departmentId', (string) $chosen->id);
    }

    public function test_delete_cannot_remove_last_table_restriction(): void
    {
        $admin = $this->actor(admin: true);
        Sanctum::actingAs($admin);
        $department = Department::create(['name' => 'محدود']);
        $table = DamDataTable::create(['name' => 'خصوصی', 'columns' => [], 'created_by' => $admin->id]);
        $table->departments()->attach($department);
        $this->deleteJson('/api/v1/departments/'.$department->id)->assertUnprocessable();
        $this->assertDatabaseHas('dam_data_table_department', ['department_id' => $department->id]);
        $table->departments()->detach();
        $this->deleteJson('/api/v1/departments/'.$department->id)->assertNoContent();
    }

    public function test_each_legacy_team_gets_independent_department_and_never_inherits_parent_members(): void
    {
        $admin = $this->actor(admin: true);
        $member = $this->actor(['assets.view', 'assets.upload']);
        $other = $this->actor(['assets.view', 'assets.upload']);
        $parent = Department::create(['name' => 'نام یکسان']);
        $other->update(['department_id' => $parent->id]);
        $a = $this->legacyTeam($parent, $member);
        $b = $this->legacyTeam($parent, $other);
        $archived = $this->legacyTeam(null, $member, 'archived');
        $table = DamDataTable::create(['name' => 'جدول', 'columns' => [], 'created_by' => $member->id]);
        DB::table('dam_data_table_team')->insert(['dam_data_table_id' => $table->id, 'team_id' => $a]);
        $this->finish($admin);
        $mapped = Department::where('legacy_team_id', $a)->firstOrFail();
        $this->assertSame($parent->id, $mapped->parent_id);
        $this->assertNotEquals($mapped->id, Department::where('legacy_team_id', $b)->value('id'));
        $this->assertSame('inactive', Department::where('legacy_team_id', $archived)->value('status'));
        $this->assertSame('reviewer', $mapped->members()->first()->pivot->role);
        $this->assertTrue(app(DamTableAccess::class)->botAllowed($member, $table, $mapped->id));
        $this->assertFalse(app(DamTableAccess::class)->canView($other, $table));
        $this->assertFalse(app(DamTableAccess::class)->botAllowed($other, $table, $mapped->id));
        $this->assertDatabaseCount('teams', 3); // retained for recovery, never a runtime ACL source
        $this->assertDatabaseCount('team_user', 3);
        $this->assertDatabaseCount('dam_data_table_team', 1);
    }

    public function test_json_bindings_and_automation_targets_are_migrated_without_losing_primary_department(): void
    {
        $admin = $this->actor(admin: true);
        $parent = Department::create(['name' => 'اصلی']);
        $team = $this->legacyTeam($parent, $admin);
        $content = Content::create(['title' => 'محتوا', 'type' => 'article', 'payload' => ['departmentId' => (string) $parent->id, 'teamId' => (string) $team]]);
        $idea = WorkspaceRecord::create(['kind' => WorkspaceRecord::KIND_IDEA, 'title' => 'ایده', 'payload' => ['teamId' => (string) $team, 'referrals' => [['toTeamId' => (string) $team]]]]);
        $folder = DomainRecord::create(['domain' => DomainRecord::DOMAIN_ASSET_FOLDER, 'payload' => ['teamId' => (string) $team, 'permissionLevel' => 'team', 'sharedWith' => [['targetType' => 'team', 'targetId' => (string) $team]]]]);
        SystemSetting::create(['key' => Automations::KEY, 'value' => ['revision' => 7, 'rules' => [['id' => (string) Str::uuid(), 'action' => 'table_row', 'team_id' => $team]]]]);
        $this->finish($admin);
        $mapped = (string) Department::where('legacy_team_id', $team)->value('id');
        $this->assertSame((string) $parent->id, $content->fresh()->payload['departmentId']);
        $this->assertContains($mapped, $content->fresh()->payload['departmentIds']);
        $this->assertArrayNotHasKey('teamId', $content->fresh()->payload);
        $this->assertSame($mapped, $idea->fresh()->payload['departmentId']);
        $this->assertSame($mapped, $idea->fresh()->payload['referrals'][0]['toDepartmentId']);
        $this->assertSame('department', $folder->fresh()->payload['permissionLevel']);
        $this->assertSame(['targetType' => 'department', 'targetId' => $mapped], $folder->fresh()->payload['sharedWith'][0]);
        $this->assertSame(8, app(Automations::class)->read()['revision']);
        $this->assertSame((int) $mapped, app(Automations::class)->read()['rules'][0]['department_id']);
    }

    public function test_batches_resume_without_duplicate_departments_memberships_or_permission_expansion(): void
    {
        $admin = $this->actor(admin: true);
        $editor = $this->actor(['teams.edit']);
        $outsider = $this->actor();
        for ($i = 0; $i < 51; $i++) {
            $this->legacyTeam(null, $editor);
        }
        $first = app(DepartmentConsolidation::class)->batch($admin);
        $this->assertSame('teams', $first['phase']);
        $this->assertSame(50, $first['after']);
        $this->assertDatabaseCount('departments', 50);
        $this->finish($admin);
        $this->finish($admin);
        $this->assertDatabaseCount('departments', 51);
        $this->assertDatabaseCount('department_user', 51);
        $this->assertTrue($editor->fresh()->hasPermission('departments.edit'));
        $this->assertTrue($editor->fresh()->hasPermission('departments.manage_members'));
        $this->assertFalse($outsider->fresh()->hasPermission('departments.edit'));
        $this->assertDatabaseMissing('permissions', ['key' => 'teams.edit']);
        $this->assertSame(1, DB::table('activity_logs')->where('type', 'departments_consolidated')->count());
    }

    public function test_partial_migration_and_missing_schema_fail_closed_but_admin_can_resume(): void
    {
        $admin = $this->actor(admin: true);
        Sanctum::actingAs($admin);
        $this->legacyTeam();
        $this->getJson('/api/v1/departments')->assertStatus(503);
        $this->getJson('/api/v1/dam/data-tables')->assertStatus(503);
        $this->postJson('/api/v1/ideas', ['title' => 'قدیمی'])->assertStatus(503);
        $this->getJson('/api/v1/departments/consolidation')->assertOk()->assertJsonPath('data.phase', 'teams');
        $this->postJson('/api/v1/departments/consolidation', ['confirm' => true])->assertOk();
        $this->finish($admin);
        $this->getJson('/api/v1/departments')->assertOk();
        Schema::drop('department_user');
        $this->getJson('/api/v1/departments')->assertStatus(503);
        $this->postJson('/api/v1/departments/consolidation', ['confirm' => true])->assertStatus(503);
    }

    public function test_migration_requires_active_admin_and_explicit_confirmation(): void
    {
        Sanctum::actingAs($this->actor(['departments.edit', 'settings.manage']));
        $this->getJson('/api/v1/departments/consolidation')->assertForbidden();
        $this->postJson('/api/v1/departments/consolidation', ['confirm' => true])->assertForbidden();
        $admin = $this->actor(admin: true);
        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/departments/consolidation', [])->assertUnprocessable();
        $admin->update(['status' => 'blocked']);
        $this->postJson('/api/v1/departments/consolidation', ['confirm' => true])->assertForbidden();
    }

    public function test_stale_team_api_and_payloads_cannot_reintroduce_team_ids(): void
    {
        Sanctum::actingAs($this->actor(admin: true));
        $this->getJson('/api/v1/teams')->assertNotFound();
        $this->postJson('/api/v1/teams', ['name' => 'old'])->assertNotFound();
        $this->postJson('/api/v1/ideas', ['title' => 'ایده', 'teamId' => '1'])->assertUnprocessable();
        $this->postJson('/api/v1/dam/folders', ['title' => 'old', 'sharedWith' => [['targetType' => 'team', 'targetId' => '1']]])->assertUnprocessable();
        $this->postJson('/api/v1/ideas', ['title' => 'ایده', 'departmentId' => 'fake-1'])->assertUnprocessable();
        $this->postJson('/api/v1/ideas', ['title' => 'ایده', 'departmentId' => '999'])->assertUnprocessable();
    }

    public function test_unknown_legacy_reference_stops_the_batch_without_silently_granting_access(): void
    {
        $admin = $this->actor(admin: true);
        Sanctum::actingAs($admin);
        $this->legacyTeam();
        $content = Content::create(['title' => 'ناشناخته', 'type' => 'article', 'payload' => ['teamId' => '999']]);
        $this->postJson('/api/v1/departments/consolidation', ['confirm' => true])->assertOk()->assertJsonPath('data.phase', 'contents');
        $this->postJson('/api/v1/departments/consolidation', ['confirm' => true])->assertUnprocessable();
        $this->assertSame('999', $content->fresh()->payload['teamId']);
        $this->assertSame('contents', app(DepartmentConsolidation::class)->status()['phase']);
        $this->getJson('/api/v1/contents')->assertStatus(503);
    }

    public function test_old_bale_drafts_and_pending_messages_are_invalidated_not_reinterpreted(): void
    {
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $admin = $this->actor(admin: true);
        $this->legacyTeam(null, $admin);
        $link = BaleUserLink::create(['user_id' => $admin->id, 'bale_user_id' => '10', 'chat_id' => '10', 'linked_at' => now()]);
        BaleConversation::create(['link_id' => $link->id, 'step' => 'asset_confirm', 'nonce' => str_repeat('a', 24), 'data' => ['team_id' => 1], 'expires_at' => now()->addMinutes(5)]);
        BaleOutbox::create(['deduplication_key' => 'legacy', 'bot_id' => '1', 'link_id' => $link->id, 'requires_link' => true, 'chat_id' => '10', 'payload' => ['text' => 'old'], 'status' => 'pending', 'available_at' => now()]);
        $this->finish($admin);
        $this->assertDatabaseCount('bale_conversations', 0);
        $this->assertSame('cancelled', BaleOutbox::first()->status);
        $this->assertSame('organization_migrated', BaleOutbox::first()->error_code);
    }

    public function test_reapplying_schema_preserves_checkpoint_and_orphan_only_upgrades_need_conversion(): void
    {
        $migration = require database_path('migrations/2026_09_28_120000_consolidate_department_structure.php');
        SystemSetting::where('key', DepartmentConsolidation::KEY)->delete();
        Content::create(['title' => 'یتیم', 'type' => 'article', 'payload' => ['teamId' => '999']]);
        $migration->up();
        $this->assertSame('teams', app(DepartmentConsolidation::class)->status()['phase']);
        SystemSetting::where('key', DepartmentConsolidation::KEY)->first()->update(['value' => ['phase' => 'contents', 'after' => 123]]);
        $migration->up();
        $this->assertSame(123, app(DepartmentConsolidation::class)->status()['after']);
        $this->assertSame('contents', app(DepartmentConsolidation::class)->status()['phase']);
    }

    public function test_registration_never_self_assigns_membership_from_a_department_name(): void
    {
        config(['auth.registration.auto_login' => false]);
        Department::create(['name' => 'واحد خصوصی']);
        $this->postJson('/api/v1/auth/register', ['name' => 'متقاضی', 'username' => 'applicant', 'email' => 'applicant@example.test',
            'password' => 'Example1234', 'password_confirmation' => 'Example1234', 'department' => 'واحد خصوصی'])->assertCreated();
        $this->assertNull(User::where('username', 'applicant')->firstOrFail()->department_id);
        $this->assertDatabaseCount('department_user', 0);
    }
}
