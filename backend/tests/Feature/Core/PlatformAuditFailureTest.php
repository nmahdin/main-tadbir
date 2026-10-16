<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Platform\Operations\OperationTokenSigner;
use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationService;
use App\Core\Platform\PlatformAdministrationControl;
use App\Core\Platform\PlatformAssignmentService;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * Stage C2-5 — audit failure must roll back the entire mutation:
 * no half-completed grants, no consumed requests, no bootstrap
 * closure. Audit failure is injected by making AuditLog creation
 * throw, which is exactly where AuditWriter writes.
 */
class PlatformAuditFailureTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'audit-failure-secret-not-for-production';

    protected function setUp(): void
    {
        parent::setUp();
        config(['platform.operations.secret' => self::SECRET]);
        PermissionCatalog::sync();
    }

    public function test_audit_failure_rolls_back_assignment_grant(): void
    {
        $admin = $this->primaryUser('af.admin');
        $role = PlatformRole::create(['key' => 'af_role', 'name' => 'AF']);
        $target = User::factory()->create(['status' => 'active']);

        $this->breakAudit();
        try {
            app(PlatformAssignmentService::class)->grant($admin, $target, $role);
            $this->fail('Grant must fail when the audit write fails.');
        } catch (RuntimeException) {
            $this->assertSame(0, PlatformRoleAssignment::where('user_id', $target->id)->count());
        }
    }

    public function test_audit_failure_rolls_back_bootstrap_completely(): void
    {
        User::factory()->create(['username' => 'af.boot', 'status' => 'active']);

        $this->breakAudit();
        try {
            $this->execute($this->token('bootstrap', 'af.boot'));
            $this->fail('Bootstrap must fail when the audit write fails.');
        } catch (RuntimeException) {
            $this->assertSame(0, PlatformRoleAssignment::count());
            $this->assertNull(PlatformAdministrationControl::singleton()->bootstrap_completed_at);
            $this->assertSame(0, \App\Core\Platform\PlatformOperationRequest::where('status', 'consumed')->count());
        }
    }

    public function test_audit_failure_rolls_back_recovery_completely(): void
    {
        $lost = User::factory()->create(['username' => 'af.lost', 'status' => 'active']);
        $this->execute($this->token('bootstrap', 'af.lost'));
        $lost->forceFill(['status' => 'suspended'])->save();
        User::factory()->create(['username' => 'af.new', 'status' => 'active']);

        $this->breakAudit();
        try {
            $this->execute($this->token('recovery', 'af.new', [
                'id' => 'INC-AF', 'reason' => 'lost', 'evidence' => ['ticket:1'],
                'verification' => ['method' => 'panel', 'reference' => 'ticket:1'],
            ]));
            $this->fail('Recovery must fail when the audit write fails.');
        } catch (RuntimeException) {
            $this->assertSame(0, PlatformRoleAssignment::whereHas('user', fn ($q) => $q->where('username', 'af.new'))->count());
            $this->assertSame(
                1,
                \App\Core\Platform\PlatformOperationRequest::where('status', 'consumed')->count(),
                'Only the original bootstrap consumption may remain.',
            );
        }
    }

    private function breakAudit(): void
    {
        AuditLog::creating(function (): void {
            throw new RuntimeException('audit storage unavailable (injected)');
        });
    }

    private function primaryUser(string $username): User
    {
        $primary = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $primary->id]);

        return $user;
    }

    /**
     * @param  array<string, mixed>|null  $incident
     */
    private function token(string $operation, string $username, ?array $incident = null): string
    {
        $payload = [
            'op' => $operation, 'request_id' => 'af-'.uniqid(), 'operator' => 'infra:af',
            'target_username' => $username, 'iat' => time(), 'exp' => time() + 600,
        ];
        if ($incident !== null) {
            $payload['incident'] = $incident;
        }

        return OperationTokenSigner::sign($payload, self::SECRET);
    }

    private function execute(string $token): PlatformRoleAssignment
    {
        return app(PlatformOperationService::class)->execute(
            app(OperationTokenVerifier::class)->verify($token),
        );
    }
}

function DB_count_operation_requests(): int
{
    return \App\Core\Platform\PlatformOperationRequest::where('status', 'consumed')->count();
}
