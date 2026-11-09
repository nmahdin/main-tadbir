<?php

namespace Tests\Feature\Core;

use App\Core\Platform\Operations\OperationTokenSigner;
use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationException;
use App\Core\Platform\Operations\PlatformOperationService;
use App\Core\Platform\PlatformAdministrationControl;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only concurrency evidence for Stage C2-4 bootstrap and
 * emergency recovery.
 *
 * Beyond proving the loser BLOCKS on the control-row lock
 * (lock-wait timeout against a winner critical section held on a
 * second InnoDB connection), each scenario completes the winning
 * operation through the real service and then asserts the final
 * invariant on committed state: exactly one usable primary, the
 * marker set exactly once, and the competing operation rejected.
 * SQLite runs skip these tests entirely.
 */
class PlatformOperationsConcurrencyMysqlTest extends TestCase
{
    private const SECRET = 'mysql-operations-secret-not-for-production';

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

    public function test_concurrent_bootstrap_attempts_grant_exactly_one_primary(): void
    {
        $targetA = $this->user('conc.boot.a');
        $targetB = $this->user('conc.boot.b');
        app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $primaryRoleId = (int) \App\Core\Platform\PlatformRole::where('key', 'primary_administrator')->value('id');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner's critical section in flight.
            $winner->table('platform_administration_control')->where('id', 1)->lockForUpdate()->first();
            $winner->table('platform_role_assignments')->insert([
                'user_id' => $targetA->id,
                'platform_role_id' => $primaryRoleId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertBlocked(fn () => $this->execute($this->token('bootstrap', 'conc.boot.b')));
        } finally {
            $winner->rollBack();
        }

        // The real bootstrap now completes exactly once.
        $this->execute($this->token('bootstrap', 'conc.boot.a'));
        $this->assertNotNull(PlatformAdministrationControl::singleton()->bootstrap_completed_at);

        // A competing bootstrap (fresh request) is rejected, and
        // the committed invariant holds: exactly one active primary.
        try {
            $this->execute($this->token('bootstrap', 'conc.boot.b'));
            $this->fail('A second bootstrap must be rejected.');
        } catch (PlatformOperationException $exception) {
            $this->assertSame('bootstrap_closed', $exception->errorCode);
        }
        $this->assertSame(1, PlatformRoleAssignment::where('platform_role_id', $primaryRoleId)->whereNull('revoked_at')->count());
        $this->assertSame($targetA->id, (int) PlatformAdministrationControl::singleton()->bootstrapped_user_id);
    }

    public function test_concurrent_recovery_attempts_leave_exactly_one_usable_primary(): void
    {
        $lost = $this->user('conc.rec.lost');
        $this->execute($this->token('bootstrap', 'conc.rec.lost'));
        $lost->forceFill(['status' => 'suspended'])->save();

        $successor = $this->user('conc.rec.new');
        $other = $this->user('conc.rec.other');
        $primaryRoleId = (int) \App\Core\Platform\PlatformRole::where('key', 'primary_administrator')->value('id');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('platform_administration_control')->where('id', 1)->lockForUpdate()->first();
            $winner->table('platform_role_assignments')->insert([
                'user_id' => $successor->id,
                'platform_role_id' => $primaryRoleId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertBlocked(fn () => $this->execute($this->recoveryToken('conc.rec.other')));
        } finally {
            $winner->rollBack();
        }

        // The real recovery completes; a second recovery then finds
        // a usable primary and is rejected.
        $this->execute($this->recoveryToken('conc.rec.new'));
        try {
            $this->execute($this->recoveryToken('conc.rec.other'));
            $this->fail('Recovery with a usable primary present must be rejected.');
        } catch (PlatformOperationException $exception) {
            $this->assertSame('recovery_not_needed', $exception->errorCode);
        }

        $usable = PlatformRoleAssignment::query()
            ->where('platform_role_id', $primaryRoleId)
            ->whereNull('revoked_at')
            ->whereHas('user', fn ($query) => $query->where('status', 'active'))
            ->pluck('user_id')
            ->all();
        $this->assertSame([$successor->id], $usable);
    }

    private function assertBlocked(callable $attempt): void
    {
        DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
        try {
            $attempt();
            $this->fail('The competing operation must block on the control-row lock.');
        } catch (QueryException $exception) {
            $this->assertStringContainsStringIgnoringCase('lock wait timeout', $exception->getMessage());
        } finally {
            DB::statement('SET SESSION innodb_lock_wait_timeout = DEFAULT');
        }
    }

    private function user(string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        $this->userIds[] = (int) $user->id;

        return $user;
    }

    private function token(string $operation, string $username, ?array $incident = null): string
    {
        $requestId = 'mysql-req-'.(++$this->sequence).'-'.uniqid();
        $this->requestIds[] = $requestId;
        $payload = [
            'op' => $operation,
            'request_id' => $requestId,
            'operator' => 'infra:mysql-test',
            'target_username' => $username,
            'iat' => time(),
            'exp' => time() + 900,
        ];
        if ($incident !== null) {
            $payload['incident'] = $incident;
        }

        return OperationTokenSigner::sign($payload, self::SECRET);
    }

    private function recoveryToken(string $username): string
    {
        return $this->token('recovery', $username, [
            'id' => 'INC-MYSQL-1',
            'reason' => 'Primary credentials lost',
            'evidence' => ['ticket:1'],
            'verification' => ['method' => 'hosting_panel_identity', 'reference' => 'ticket:1'],
        ]);
    }

    private function execute(string $token): PlatformRoleAssignment
    {
        $verified = app(OperationTokenVerifier::class)->verify($token);

        return app(PlatformOperationService::class)->execute($verified);
    }
}
