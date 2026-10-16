<?php

namespace Tests\Feature\Core;

use App\Core\Platform\PlatformAdministrationControl;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Stage C2-5 — C1→C2 migration & provisioning verification
 * (disposable test databases only).
 */
class PlatformMigrationVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
    }

    public function test_permission_scope_check_rejects_unknown_scopes(): void
    {
        $this->expectException(QueryException::class);
        DB::table('core_permissions')->insert([
            'key' => 'bogus.scope', 'scope' => 'galaxy', 'label' => 'x',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_one_active_platform_assignment_per_user_across_different_roles(): void
    {
        app(PlatformRoleProvisioner::class)->provisionCustomRole('mig_a', 'A', []);
        app(PlatformRoleProvisioner::class)->provisionCustomRole('mig_b', 'B', []);
        $roles = \App\Core\Platform\PlatformRole::whereIn('key', ['mig_a', 'mig_b'])->pluck('id', 'key');
        $user = User::factory()->create(['status' => 'active']);

        DB::table('platform_role_assignments')->insert([
            'user_id' => $user->id, 'platform_role_id' => $roles['mig_a'],
            'created_at' => now(), 'updated_at' => now(),
        ]);

        try {
            DB::table('platform_role_assignments')->insert([
                'user_id' => $user->id, 'platform_role_id' => $roles['mig_b'],
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->fail('The generated active-user uniqueness must reject a second active assignment.');
        } catch (QueryException) {
            $this->assertSame(1, DB::table('platform_role_assignments')->where('user_id', $user->id)->count());
        }
    }

    public function test_repeated_provisioning_and_sync_never_expand_privileges_or_promote_users(): void
    {
        $provisioner = app(PlatformRoleProvisioner::class);
        $role = $provisioner->ensurePrimaryAdministrator();
        $before = DB::table('platform_role_permissions')->where('platform_role_id', $role->id)->count();

        PermissionCatalog::sync();
        PermissionCatalog::sync();
        $provisioner->ensurePrimaryAdministrator();
        $provisioner->provision();

        $this->assertSame(count(PermissionCatalog::platformKeys()), $before);
        $this->assertSame($before, DB::table('platform_role_permissions')->where('platform_role_id', $role->id)->count());
        $this->assertSame(0, DB::table('platform_role_assignments')->count(), 'Provisioning must never assign users.');
        $this->assertSame(1, DB::table('platform_roles')->where('key', 'primary_administrator')->count());
    }

    public function test_control_singleton_is_recreated_safely_when_missing(): void
    {
        DB::table('platform_administration_control')->delete();

        $control = PlatformAdministrationControl::singleton();
        $this->assertSame(1, (int) $control->id);
        $this->assertSame(1, PlatformAdministrationControl::count());
    }

    public function test_rollbacks_refuse_to_destroy_platform_history(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $primary = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        DB::table('platform_role_assignments')->insert([
            'user_id' => $user->id, 'platform_role_id' => $primary->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('platform_operation_requests')->insert([
            'request_id' => 'mig-check-1', 'operation' => 'bootstrap',
            'operator_id' => 'infra:test', 'status' => 'consumed',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $c24 = require base_path('database/migrations/2026_10_15_000007_create_platform_operation_requests_table.php');
        try {
            $c24->down();
            $this->fail('C2-4 rollback must refuse while consumed operation records exist.');
        } catch (\RuntimeException) {
            $this->assertTrue(Schema::hasTable('platform_operation_requests'));
        }

        $c21 = require base_path('database/migrations/2026_10_15_000006_create_platform_administration_tables.php');
        try {
            $c21->down();
            $this->fail('C2-1 rollback must refuse while assignment history exists.');
        } catch (\RuntimeException) {
            $this->assertTrue(Schema::hasTable('platform_role_assignments'));
            $this->assertSame(1, DB::table('platform_role_assignments')->count());
        }
    }
}
