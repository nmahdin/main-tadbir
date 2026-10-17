<?php

namespace Tests\Feature\Core;

use App\Core\Platform\PlatformAdministrationControl;
use App\Core\Platform\PlatformProvisioningException;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedPermission;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

/**
 * Stage C2-1 — platform schema and permission registry (SQLite).
 *
 * MySQL-specific enforcement (scope CHECK, generated-column
 * behavior on InnoDB, singleton CHECK) is proven separately in
 * PlatformSchemaMysqlTest; nothing about MySQL is claimed here.
 */
class PlatformSchemaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
    }

    public function test_platform_tables_and_control_row_exist(): void
    {
        foreach (['platform_roles', 'platform_role_permissions', 'platform_role_assignments', 'platform_administration_control'] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }

        $control = PlatformAdministrationControl::singleton();
        $this->assertSame(1, (int) $control->id);
        $this->assertNull($control->bootstrap_completed_at);
        $this->assertSame(1, PlatformAdministrationControl::count());
    }

    public function test_platform_permissions_are_registered_with_platform_scope(): void
    {
        $expected = [
            'platform.admins.view',
            'platform.admins.manage',
            'platform.users.view',
            'platform.users.manage_status',
            'platform.organizations.view',
            'platform.organizations.manage_status',
            'platform.organizations.end',
            'platform.organizations.restore',
            'platform.audit.view',
            'platform.subscriptions.manage',
        ];

        $this->assertSame($expected, PermissionCatalog::keysForScope(PermissionCatalog::SCOPE_PLATFORM));
        foreach ($expected as $key) {
            $this->assertSame('platform', PermissionCatalog::scopeOf($key));
            $this->assertDatabaseHas('core_permissions', ['key' => $key, 'scope' => 'platform']);
        }
        // Catalog synchronization grants nothing by itself.
        $this->assertSame(0, PlatformRole::count());
        $this->assertSame(0, PlatformRoleAssignment::count());
    }

    public function test_cross_scope_keys_are_rejected_for_platform_provisioning(): void
    {
        PermissionCatalog::assertKnownKeysForScope(['platform.users.view'], PermissionCatalog::SCOPE_PLATFORM);

        foreach (['workspace.view', 'organization.view', 'projects.view'] as $foreignKey) {
            try {
                PermissionCatalog::assertKnownKeysForScope([$foreignKey], PermissionCatalog::SCOPE_PLATFORM);
                $this->fail("Cross-scope key {$foreignKey} must be rejected for platform scope.");
            } catch (RbacValidationException) {
                $this->addToAssertionCount(1);
            }
        }

        try {
            PermissionCatalog::assertKnownKeysForScope(['platform.users.view'], PermissionCatalog::SCOPE_WORKSPACE);
            $this->fail('Platform keys must be rejected for workspace scope.');
        } catch (RbacValidationException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_at_most_one_active_assignment_per_user_and_history_is_preserved(): void
    {
        $role = $this->customRole();
        $user = User::factory()->create();

        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        try {
            PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);
            $this->fail('A second active platform assignment must violate the unique constraint.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }

        // Soft-revoke, then a new assignment is allowed and the
        // revoked row remains as history.
        PlatformRoleAssignment::where('user_id', $user->id)->update(['revoked_at' => now()]);
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        $this->assertSame(2, PlatformRoleAssignment::where('user_id', $user->id)->count());
        $this->assertSame(1, PlatformRoleAssignment::where('user_id', $user->id)->whereNull('revoked_at')->count());
    }

    public function test_assignment_history_blocks_user_and_role_deletion(): void
    {
        $role = $this->customRole();
        $permission = ScopedPermission::where('key', 'platform.users.view')->firstOrFail();
        $role->permissions()->attach($permission->id);
        $user = User::factory()->create();
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        foreach ([
            fn () => $user->delete(),
            fn () => $role->delete(),
            fn () => $permission->delete(),
        ] as $attempt) {
            try {
                $attempt();
                $this->fail('RESTRICT foreign keys must block deletion while references exist.');
            } catch (QueryException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->assertDatabaseHas('platform_role_assignments', ['user_id' => $user->id]);
    }

    public function test_primary_role_provisioning_is_idempotent_and_assigns_nobody(): void
    {
        $provisioner = app(PlatformRoleProvisioner::class);

        $role = $provisioner->ensurePrimaryAdministrator();
        $this->assertTrue($role->is_protected);
        $this->assertEqualsCanonicalizing(
            PlatformRoleProvisioner::primaryPermissions(),
            $role->permissions()->pluck('key')->all(),
        );

        $again = $provisioner->ensurePrimaryAdministrator();
        $this->assertSame($role->id, $again->id);
        $this->assertSame(1, PlatformRole::count());
        $this->assertSame(10, $again->permissions()->count());
        $this->assertSame(0, PlatformRoleAssignment::count());
    }

    public function test_provisioning_reports_conflicting_existing_definition_instead_of_silent_change(): void
    {
        $role = $this->customRole(PlatformRoleProvisioner::PRIMARY_ROLE_KEY);
        $role->permissions()->attach(ScopedPermission::where('key', 'platform.users.view')->firstOrFail()->id);

        try {
            app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
            $this->fail('A conflicting protected-role definition must be reported explicitly.');
        } catch (PlatformProvisioningException) {
            $this->addToAssertionCount(1);
        }

        // Nothing was silently expanded.
        $this->assertSame(1, $role->permissions()->count());
    }

    public function test_provisioning_reports_unprotected_name_collision(): void
    {
        PlatformRole::create(['key' => PlatformRoleProvisioner::PRIMARY_ROLE_KEY, 'name' => 'Fake', 'is_protected' => false]);

        $this->expectException(PlatformProvisioningException::class);
        app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
    }

    public function test_no_legacy_admin_is_automatically_promoted(): void
    {
        $legacyRole = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
            ['key' => 'users.view'],
            ['label' => 'users.view', 'category' => 'tests'],
        ));
        $legacyAdmin = User::factory()->create(['role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);

        app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();

        $this->assertSame(0, PlatformRoleAssignment::count());
        $this->assertSame(0, PlatformRoleAssignment::where('user_id', $legacyAdmin->id)->count());
    }

    public function test_rollback_is_refused_when_assignment_history_exists(): void
    {
        $role = $this->customRole();
        $user = User::factory()->create();
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        $migration = require database_path('migrations/2026_10_15_000006_create_platform_administration_tables.php');

        try {
            $migration->down();
            $this->fail('Rollback must be refused while assignment history exists.');
        } catch (RuntimeException) {
            $this->addToAssertionCount(1);
        }

        $this->assertTrue(Schema::hasTable('platform_role_assignments'));
        $this->assertDatabaseHas('platform_role_assignments', ['user_id' => $user->id]);
    }

    private function customRole(string $key = 'platform_test_role'): PlatformRole
    {
        return PlatformRole::create(['key' => $key, 'name' => 'Test Role', 'is_protected' => false]);
    }
}
