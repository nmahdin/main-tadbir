<?php

namespace Tests\Feature\Core;

use App\Core\Platform\PlatformAssignmentService;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Platform\PlatformRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedPermission;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only concurrency evidence for Stage C2-2 platform
 * administration.
 *
 * SQLite cannot prove control-row locking (it ignores
 * SELECT ... FOR UPDATE), so these tests are SKIPPED off MySQL —
 * the sequential logic is covered by PlatformAuthorizationTest.
 * Method mirrors CoreIdentityConcurrencyMysqlTest: committed
 * fixtures (cleaned up explicitly), a winner critical section held
 * uncommitted on a second InnoDB connection, and the competing
 * operation running the REAL platform service with a short
 * lock-wait timeout: the loser must block (genuine overlap), and
 * after the winner commits the final-primary invariant must hold.
 */
class PlatformConcurrencyMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $userIds = [];

    /** @var list<int> */
    private array $roleIds = [];

    private PlatformRole $primaryRole;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise row locks).');
        }

        config(['database.connections.mysql_concurrent' => config('database.connections.mysql')]);
        DB::purge('mysql_concurrent');

        PermissionCatalog::sync();
        $this->primaryRole = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('audit_logs')->whereIn('target_id', array_merge($this->userIds, $this->roleIds))->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('platform_role_permissions')->whereIn('platform_role_id', $this->roleIds)->delete();
            DB::table('platform_roles')->whereIn('id', $this->roleIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_competing_revokes_cannot_remove_the_final_usable_primary(): void
    {
        $primaryA = $this->makePrimary();
        $primaryB = $this->makePrimary();
        $manager = $this->actorWithRole(['platform.admins.manage'], 'concurrency_manager');
        $service = app(PlatformAssignmentService::class);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner's critical section in flight: control lock held,
            // B's revocation uncommitted.
            $winner->table('platform_administration_control')->where('id', 1)->lockForUpdate()->first();
            $winner->table('platform_role_assignments')
                ->where('user_id', $primaryB->id)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            $this->assertBlockedOnControlLock(
                fn () => $service->revoke($manager, $this->activeAssignment($primaryA)),
            );
        } finally {
            $winner->rollBack();
        }

        // Nothing changed after rollback.
        $this->assertNull($this->activeAssignment($primaryA)->revoked_at);
        $this->assertNull($this->activeAssignment($primaryB)->revoked_at);

        // B's revocation now commits for real...
        $service->revoke($manager, $this->activeAssignment($primaryB));
        $this->assertNotNull($this->activeAssignmentRow($primaryB)->revoked_at);

        // ...leaving A as the final usable primary: revoking A is
        // rejected and A's assignment survives untouched.
        try {
            $service->revoke($manager, $this->activeAssignment($primaryA));
            $this->fail('Revoking the final usable primary must be rejected.');
        } catch (RbacValidationException) {
            $this->assertNull($this->activeAssignment($primaryA)->revoked_at);
        }
    }

    public function test_role_permission_edits_contend_for_the_same_control_lock(): void
    {
        $primary = $this->makePrimary();
        $role = $this->roleWith(['platform.users.view'], 'concurrency_role');
        $service = app(PlatformRoleService::class);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('platform_administration_control')->where('id', 1)->lockForUpdate()->first();
            $winner->table('platform_roles')->where('id', $role->id)->update(['name' => 'Winner Edit']);

            $this->assertBlockedOnControlLock(
                fn () => $service->updateRolePermissions($primary, $role, ['platform.users.view', 'platform.audit.view']),
            );
        } finally {
            $winner->rollBack();
        }

        // After the winner rolls back, the real edit succeeds and is
        // audited.
        $service->updateRolePermissions($primary, $role->fresh(), ['platform.users.view', 'platform.audit.view']);
        $this->assertEqualsCanonicalizing(
            ['platform.users.view', 'platform.audit.view'],
            $role->fresh()->permissions()->pluck('key')->all(),
        );
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'platform.role_permissions_updated',
            'target_id' => $role->id,
        ]);
    }

    private function assertBlockedOnControlLock(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
        try {
            $attempt();
            $this->fail('The competing platform operation must block on the control-row lock.');
        } catch (QueryException $exception) {
            $this->assertStringContainsStringIgnoringCase('lock wait timeout', $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = DEFAULT');
        }
    }

    private function makePrimary(): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $user->id;
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => $this->primaryRole->id,
        ]);

        return $user;
    }

    /**
     * @param  list<string>  $keys
     */
    private function actorWithRole(array $keys, string $roleKey): User
    {
        $role = $this->roleWith($keys, $roleKey);
        $user = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $user->id;
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
        $this->roleIds[] = (int) $role->id;
        $role->permissions()->attach(ScopedPermission::whereIn('key', $keys)->pluck('id')->all());

        return $role;
    }

    private function activeAssignment(User $user): PlatformRoleAssignment
    {
        return PlatformRoleAssignment::where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->firstOrFail();
    }

    private function activeAssignmentRow(User $user): PlatformRoleAssignment
    {
        return PlatformRoleAssignment::where('user_id', $user->id)->firstOrFail();
    }
}
