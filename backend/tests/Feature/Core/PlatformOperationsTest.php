<?php

namespace Tests\Feature\Core;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Platform\Operations\OperationTokenSigner;
use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationException;
use App\Core\Platform\Operations\PlatformOperationService;
use App\Core\Platform\PlatformAdministrationControl;
use App\Core\Platform\PlatformOperationRequest;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * Stage C2-4 — platform bootstrap and emergency recovery.
 *
 * Concurrency proofs live in PlatformOperationsConcurrencyMysqlTest;
 * SQLite proves the logic and the token contract.
 */
class PlatformOperationsTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-operations-secret-not-for-production';

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config(['platform.operations.secret' => self::SECRET]);
        PermissionCatalog::sync();
    }

    public function test_successful_initial_bootstrap_closes_permanently(): void
    {
        $target = User::factory()->create(['username' => 'first.primary', 'status' => 'active']);

        $assignment = $this->execute($this->token('bootstrap', 'first.primary'));
        $this->assertSame(PlatformRoleProvisioner::PRIMARY_ROLE_KEY, $assignment->role->key);
        $this->assertNull($assignment->granted_by_user_id);

        $control = PlatformAdministrationControl::singleton();
        $this->assertNotNull($control->bootstrap_completed_at);
        $this->assertSame($target->id, (int) $control->bootstrapped_user_id);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'platform.bootstrap_completed',
            'actor_user_id' => null,
            'target_id' => $target->id,
        ]);
        $this->assertSame('consumed', PlatformOperationRequest::sole()->status);

        $other = User::factory()->create(['username' => 'second.primary', 'status' => 'active']);
        $this->assertOperationFails('bootstrap_closed', $this->token('bootstrap', 'second.primary'));
        $this->assertSame(1, PlatformRoleAssignment::count());
    }

    public function test_bootstrap_rejected_when_any_primary_history_exists_even_if_marker_cleared(): void
    {
        User::factory()->create(['username' => 'hist.primary', 'status' => 'active']);
        $this->execute($this->token('bootstrap', 'hist.primary'));

        // Simulate marker tampering/loss: history alone must keep
        // bootstrap closed.
        PlatformAdministrationControl::query()->update(['bootstrap_completed_at' => null]);
        PlatformRoleAssignment::query()->update(['revoked_at' => now()]);

        User::factory()->create(['username' => 'hist.other', 'status' => 'active']);
        $this->assertOperationFails('bootstrap_history_exists', $this->token('bootstrap', 'hist.other'));
    }

    public function test_bootstrap_rejects_non_operational_targets_and_rolls_back(): void
    {
        $inactive = User::factory()->create(['username' => 'inact.user', 'status' => 'inactive']);
        $this->assertOperationFails('target_not_operational', $this->token('bootstrap', 'inact.user'));
        $this->assertNull(PlatformAdministrationControl::singleton()->bootstrap_completed_at);
        $this->assertSame(0, PlatformOperationRequest::where('status', 'consumed')->count());
        $this->assertSame(0, PlatformRoleAssignment::count());

        // A target already holding a platform role conflicts, and
        // the failure must not consume the request or close bootstrap.
        $role = PlatformRole::create(['key' => 'pre_role', 'name' => 'Pre']);
        $holder = User::factory()->create(['username' => 'holder.user', 'status' => 'active']);
        PlatformRoleAssignment::create(['user_id' => $holder->id, 'platform_role_id' => $role->id]);
        $this->assertOperationFails('operation_conflict', $this->token('bootstrap', 'holder.user'));
        $this->assertNull(PlatformAdministrationControl::singleton()->bootstrap_completed_at);
        $this->assertSame(0, PlatformOperationRequest::where('status', 'consumed')->count());
    }

    public function test_token_security_expired_tampered_malformed_and_replayed(): void
    {
        User::factory()->create(['username' => 'tok.user', 'status' => 'active']);

        $expired = $this->token('bootstrap', 'tok.user', ['iat' => time() - 7200, 'exp' => time() - 3600]);
        $this->assertVerificationFails('token_expired', $expired);

        $valid = $this->token('bootstrap', 'tok.user');
        $tampered = substr($valid, 0, -2).'xx';
        $this->assertVerificationFails('token_signature_invalid', $tampered);
        $this->assertVerificationFails('token_malformed', 'not-a-token');

        $this->execute($valid);
        $this->assertOperationFails('request_replayed', $valid);
    }

    public function test_legacy_admin_has_no_inherent_bootstrap_or_recovery_authority(): void
    {
        $legacyRole = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
            ['key' => 'users.view'],
            ['label' => 'users.view', 'category' => 'tests'],
        ));
        User::factory()->create(['username' => 'legacy.admin', 'role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);
        User::factory()->create(['username' => 'chosen.user', 'status' => 'active']);

        // Bootstrap executes purely on the signed operational
        // request: the audit actor is null and the legacy admin
        // receives nothing.
        $this->execute($this->token('bootstrap', 'chosen.user'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'platform.bootstrap_completed', 'actor_user_id' => null]);
        $this->assertSame(0, PlatformRoleAssignment::whereHas('user', fn ($q) => $q->where('username', 'legacy.admin'))->count());
    }

    public function test_recovery_requires_bootstrap_evidence_and_no_usable_primary(): void
    {
        $target = User::factory()->create(['username' => 'rec.target', 'status' => 'active']);

        // Before any bootstrap, recovery is impossible.
        $this->assertOperationFails('bootstrap_not_completed', $this->recoveryToken('rec.target'));

        User::factory()->create(['username' => 'rec.primary', 'status' => 'active']);
        $this->execute($this->token('bootstrap', 'rec.primary'));

        // A usable primary exists: recovery is refused.
        $this->assertOperationFails('recovery_not_needed', $this->recoveryToken('rec.target'));

        // Missing incident evidence fails closed even when the
        // primary later becomes unusable.
        User::where('username', 'rec.primary')->first()->forceFill(['status' => 'suspended'])->save();
        $bare = $this->token('recovery', 'rec.target');
        $this->assertOperationFails('incident_evidence_missing', $bare);

        $noVerification = $this->token('recovery', 'rec.target', [], [
            'id' => 'INC-7', 'reason' => 'lost credentials', 'evidence' => ['ticket:7'],
        ]);
        $this->assertOperationFails('incident_evidence_missing', $noVerification);

        // Deactivated accounts cannot be resurrected by recovery.
        $target->forceFill(['status' => 'deactivated'])->save();
        $this->assertOperationFails('target_not_operational', $this->recoveryToken('rec.target'));
    }

    public function test_approved_emergency_recovery_grants_primary_and_audits_incident(): void
    {
        $primary = User::factory()->create(['username' => 'lost.primary', 'status' => 'active']);
        $this->execute($this->token('bootstrap', 'lost.primary'));
        // The only primary loses operational access (suspended):
        // database-observable unusability.
        $primary->forceFill(['status' => 'suspended'])->save();

        $successor = User::factory()->create(['username' => 'new.primary', 'status' => 'active']);
        $assignment = $this->execute($this->recoveryToken('new.primary'));

        $this->assertSame(PlatformRoleProvisioner::PRIMARY_ROLE_KEY, $assignment->role->key);
        $audit = \App\Core\Audit\AuditLog::where('action', 'platform.emergency_recovery')->sole();
        $this->assertNull($audit->actor_user_id);
        $this->assertSame('INC-42', $audit->summary['incident_id']);
        $this->assertSame('infra:ops-lead', $audit->summary['operator_id']);
        // The suspended primary's assignment is untouched history.
        $this->assertNull(PlatformRoleAssignment::where('user_id', $primary->id)->sole()->revoked_at);

        // Recovery is closed again now that a usable primary exists.
        User::factory()->create(['username' => 'third.user', 'status' => 'active']);
        $this->assertOperationFails('recovery_not_needed', $this->recoveryToken('third.user'));
    }

    public function test_artisan_issue_and_execute_round_trip(): void
    {
        User::factory()->create(['username' => 'cli.primary', 'status' => 'active']);

        Artisan::call('platform:operations:issue', [
            '--operation' => 'bootstrap',
            '--target' => 'cli.primary',
            '--operator' => 'infra:cli-test',
            '--request-id' => 'cli-request-1',
        ]);
        $token = trim(Artisan::output());
        $this->assertStringContainsString('.', $token);

        $exit = Artisan::call('platform:operations:execute', ['token' => $token]);
        $this->assertSame(0, $exit);
        $this->assertNotNull(PlatformAdministrationControl::singleton()->bootstrap_completed_at);

        // Replaying through the CLI fails non-zero.
        $exit = Artisan::call('platform:operations:execute', ['token' => $token]);
        $this->assertSame(1, $exit);
    }

    public function test_bootstrapped_primary_still_has_no_workspace_access(): void
    {
        $primary = User::factory()->create(['username' => 'ws.primary', 'status' => 'active']);
        $this->execute($this->token('bootstrap', 'ws.primary'));

        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $this->expectException(AuthorizationDeniedException::class);
        app(AuthorizationService::class)->authorize($primary->fresh(), $workspace->id, 'workspace.view');
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @param  array<string, mixed>|null  $incident
     */
    private function token(string $operation, string $username, array $overrides = [], ?array $incident = null): string
    {
        $payload = array_merge([
            'op' => $operation,
            'request_id' => 'req-'.(++$this->sequence).'-'.uniqid(),
            'operator' => 'infra:ops-lead',
            'target_username' => $username,
            'iat' => time(),
            'exp' => time() + 900,
        ], $overrides);
        if ($incident !== null) {
            $payload['incident'] = $incident;
        }

        return OperationTokenSigner::sign($payload, self::SECRET);
    }

    private function recoveryToken(string $username): string
    {
        return $this->token('recovery', $username, [], [
            'id' => 'INC-42',
            'reason' => 'Primary administrator credentials irrecoverably lost',
            'evidence' => ['hosting-ticket:8841', 'identity-check:video-12'],
            'verification' => ['method' => 'hosting_panel_identity', 'reference' => 'ticket:8841'],
        ]);
    }

    private function execute(string $token): PlatformRoleAssignment
    {
        $verified = app(OperationTokenVerifier::class)->verify($token);

        return app(PlatformOperationService::class)->execute($verified);
    }

    private function assertOperationFails(string $code, string $token): void
    {
        try {
            $this->execute($token);
            $this->fail("Operation must fail with [{$code}].");
        } catch (PlatformOperationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }

    private function assertVerificationFails(string $code, string $token): void
    {
        try {
            app(OperationTokenVerifier::class)->verify($token);
            $this->fail("Verification must fail with [{$code}].");
        } catch (PlatformOperationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
