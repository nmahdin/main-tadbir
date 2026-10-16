<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Identity\AccountLifecycle;
use App\Core\Platform\Operations\OperationTokenSigner;
use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationException;
use App\Core\Platform\Operations\PlatformOperationService;
use App\Core\Platform\PlatformAdministrationControl;
use App\Core\Platform\PlatformAssignmentService;
use App\Core\Platform\PlatformAuthorizationException;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Platform\PlatformRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

/**
 * MySQL-only invariant races for Stage C2-5.
 *
 * Each scenario holds a winner critical section on a second
 * InnoDB connection, proves the competing mutation BLOCKS on the
 * platform control lock, rolls the winner back, and then verifies
 * the committed postcondition after the real operation completes:
 * the final usable Primary Administrator always survives, exactly
 * one active assignment exists per user, and consumed operation
 * requests stay consumed. Lock timeouts alone are never treated
 * as evidence.
 */
class PlatformInvariantsConcurrencyMysqlTest extends TestCase
{
    private const SECRET = 'invariants-secret-not-for-production';

    /** @var list<int> */
    private array $userIds = [];

    /** @var list<string> */
    private array $requestIds = [];

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise row locks).');
        }

        config([
            'database.connections.mysql_concurrent' => config('database.connections.mysql'),
            'platform.operations.secret' => self::SECRET,
        ]);
        DB::purge('mysql_concurrent');
        PermissionCatalog::sync();
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('audit_logs')->whereIn('target_id', $this->userIds)->delete();
            DB::table('platform_operation_requests')->whereIn('request_id', $this->requestIds)->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
            PlatformAdministrationControl::query()->update([
                'bootstrap_completed_at' => null,
                'bootstrapped_user_id' => null,
            ]);
        }

        parent::tearDown();
    }

    public function test_revoke_race_against_last_primary_still_ends_with_primary_intact(): void
    {
        $admin = $this->primaryUser('inv.admin');
        $primary = $this->primaryUser('inv.primary');
        $assignment = $this->assignmentOf($primary);
        $second = $this->primaryUser('inv.second');
        // Make $primary the FINAL usable primary: remove the others
        // from usability by suspending their accounts directly is
        // not enough (guard counts actor too) — instead revoke the
        // second primary normally while two remain usable.
        app(PlatformAssignmentService::class)->revoke($admin, $this->assignmentOf($second));
        app(PlatformAssignmentService::class)->revoke($primary, $this->assignmentOf($admin));

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $this->lockControl($winner);
            $winner->table('platform_role_assignments')->where('id', $assignment->id)->update(['revoked_at' => now()]);

            $this->assertBlocked(fn () => app(PlatformAssignmentService::class)->revoke($primary, $assignment));
        } finally {
            $winner->rollBack();
        }

        // With contention gone, revoking the final usable primary
        // is rejected outright and the invariant holds.
        try {
            app(PlatformAssignmentService::class)->revoke($primary, $assignment->fresh());
            $this->fail('Final usable primary revocation must be rejected.');
        } catch (PlatformAuthorizationException) {
            $this->assertNull($assignment->fresh()->revoked_at);
            $this->assertSame(1, $this->usablePrimaryCount());
        }
    }

    public function test_suspension_race_cannot_remove_last_primary(): void
    {
        $primary = $this->primaryUser('inv.suspend');
        $lifecycleAdmin = $this->lifecycleAdmin();

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $this->lockControl($winner);
            $winner->table('users')->where('id', $primary->id)->update(['status' => 'suspended']);

            $this->assertBlocked(fn () => app(AccountLifecycle::class)->suspend($lifecycleAdmin, $primary->fresh()));
        } finally {
            $winner->rollBack();
        }

        try {
            app(AccountLifecycle::class)->suspend($lifecycleAdmin, $primary->fresh());
            $this->fail('Suspending the final usable primary must be rejected.');
        } catch (PlatformAuthorizationException) {
            $this->assertSame('active', $primary->fresh()->status);
            $this->assertSame(1, $this->usablePrimaryCount());
        }
    }

    public function test_replacement_race_preserves_exactly_one_active_assignment(): void
    {
        $admin = $this->primaryUser('inv.rep.admin');
        $roleA = $this->role('inv_rep_a');
        $roleB = $this->role('inv_rep_b');
        $target = $this->user('inv.rep.target');
        $assignmentA = PlatformRoleAssignment::create([
            'user_id' => $target->id, 'platform_role_id' => $roleA->id,
        ]);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $this->lockControl($winner);
            $winner->table('platform_role_assignments')->where('id', $assignmentA->id)->update(['revoked_at' => now()]);
            $winner->table('platform_role_assignments')->insert([
                'user_id' => $target->id, 'platform_role_id' => $roleB->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            $this->assertBlocked(fn () => app(PlatformAssignmentService::class)->replace($admin, $assignmentA, $roleB));
        } finally {
            $winner->rollBack();
        }

        app(PlatformAssignmentService::class)->replace($admin, $assignmentA->fresh(), $roleB);

        $active = PlatformRoleAssignment::where('user_id', $target->id)->whereNull('revoked_at')->get();
        $this->assertCount(1, $active);
        $this->assertSame($roleB->id, (int) $active->first()->platform_role_id);
        $this->assertNotNull($assignmentA->fresh()->revoked_at);
    }

    public function test_shared_role_permission_edit_race_serializes_with_assignment_changes(): void
    {
        $admin = $this->primaryUser('inv.edit.admin');
        $role = $this->role('inv_edit_role');
        $usersViewId = (int) \App\Core\Rbac\ScopedPermission::where('key', 'platform.users.view')->value('id');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $this->lockControl($winner);
            $winner->table('platform_role_permissions')->insert([
                'platform_role_id' => $role->id, 'permission_id' => $usersViewId,
            ]);

            $this->assertBlocked(fn () => app(PlatformRoleService::class)->updateRolePermissions($admin, $role, []));
        } finally {
            $winner->rollBack();
        }

        app(PlatformRoleService::class)->updateRolePermissions($admin, $role, ['platform.users.view']);
        $this->assertSame(
            ['platform.users.view'],
            $role->fresh()->permissions->pluck('key')->all(),
        );
    }

    public function test_replay_of_consumed_request_after_contention_still_fails_closed(): void
    {
        $target = $this->user('inv.replay.target');
        $token = $this->token('bootstrap', $target->username);
        $this->executeToken($token);
        $this->assertNotNull(PlatformAdministrationControl::singleton()->bootstrap_completed_at);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $this->lockControl($winner);
            $this->assertBlocked(fn () => $this->executeToken($token));
        } finally {
            $winner->rollBack();
        }

        try {
            $this->executeToken($token);
            $this->fail('A consumed request must stay consumed.');
        } catch (PlatformOperationException $exception) {
            $this->assertSame('request_replayed', $exception->errorCode);
        }

        $this->assertSame(1, PlatformRoleAssignment::where('user_id', $target->id)->whereNull('revoked_at')->count());
        $this->assertSame(
            1,
            DB::table('platform_operation_requests')->where('request_id', $this->requestIds[0])->where('status', 'consumed')->count(),
        );
    }

    public function test_audit_failure_during_mysql_grant_rolls_back(): void
    {
        $admin = $this->primaryUser('inv.audit.admin');
        $role = $this->role('inv_audit_role');
        $target = $this->user('inv.audit.target');

        AuditLog::creating(function (): void {
            throw new RuntimeException('audit unavailable (injected)');
        });
        try {
            app(PlatformAssignmentService::class)->grant($admin, $target, $role);
            $this->fail('Grant must fail when audit fails.');
        } catch (RuntimeException) {
            $this->assertSame(0, PlatformRoleAssignment::where('user_id', $target->id)->count());
        }
    }

    private function lockControl(\Illuminate\Database\ConnectionInterface $connection): void
    {
        $connection->table('platform_administration_control')->where('id', 1)->lockForUpdate()->first();
    }

    private function assertBlocked(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
        try {
            $attempt();
            $this->fail('The competing mutation must block on the control-row lock.');
        } catch (QueryException $exception) {
            $this->assertStringContainsStringIgnoringCase('lock wait timeout', $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = DEFAULT');
        }
    }

    private function usablePrimaryCount(): int
    {
        return PlatformRoleAssignment::query()
            ->where('platform_role_id', app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id)
            ->whereNull('revoked_at')
            ->whereHas('user', fn ($query) => $query->where('status', 'active'))
            ->count();
    }

    private function primaryUser(string $username): User
    {
        $user = $this->user($username);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id,
        ]);

        return $user;
    }

    private function lifecycleAdmin(): User
    {
        $role = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $role->permissions()->syncWithoutDetaching(
            Permission::firstOrCreate(['key' => 'users.status'], ['label' => 'users.status', 'category' => 'tests']),
        );
        $admin = User::factory()->create(['role_id' => $role->id, 'role_key' => 'admin', 'status' => 'active']);
        $this->userIds[] = (int) $admin->id;

        return $admin;
    }

    private function assignmentOf(User $user): PlatformRoleAssignment
    {
        return PlatformRoleAssignment::where('user_id', $user->id)->whereNull('revoked_at')->firstOrFail();
    }

    private function role(string $key): PlatformRole
    {
        return PlatformRole::create(['key' => $key, 'name' => $key]);
    }

    private function user(string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        $this->userIds[] = (int) $user->id;

        return $user;
    }

    private function token(string $operation, string $username): string
    {
        $requestId = 'inv-req-'.(++$this->sequence).'-'.uniqid();
        $this->requestIds[] = $requestId;

        return OperationTokenSigner::sign([
            'op' => $operation, 'request_id' => $requestId, 'operator' => 'infra:inv',
            'target_username' => $username, 'iat' => time(), 'exp' => time() + 900,
        ], self::SECRET);
    }

    private function executeToken(string $token): PlatformRoleAssignment
    {
        return app(PlatformOperationService::class)->execute(
            app(OperationTokenVerifier::class)->verify($token),
        );
    }
}
