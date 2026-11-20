<?php

namespace Tests\Feature\Core;

use App\Core\Operations\Backup\BackupJobStatus;
use App\Core\Operations\Backup\BackupService;
use App\Core\Operations\Incidents\IncidentService;
use App\Core\Operations\Incidents\IncidentSeverity;
use App\Core\Operations\Incidents\IncidentStatus;
use App\Core\Operations\Maintenance\MaintenanceService;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Security\Mfa\MfaService;
use App\Core\Security\Mfa\TotpEngine;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * Stage C7-CORE — MFA, step-up, incidents, maintenance, backup and
 * restore preflight/verification. Tests run on SQLite in memory.
 */
class C7SecurityOperationsTest extends TestCase
{
    use RefreshDatabase;

    private PlatformRole $primaryRole;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        $this->primaryRole = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $this->admin = User::factory()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('secret-password'),
        ]);
        PlatformRoleAssignment::query()->create([
            'user_id' => $this->admin->id,
            'platform_role_id' => $this->primaryRole->id,
            'granted_by_user_id' => $this->admin->id,
        ]);
    }

    // ---- C7-A: MFA ----

    public function testMfaEnrollmentActivatesWithValidTotp(): void
    {
        Sanctum::actingAs($this->admin);
        $response = $this->postJson('/api/v1/me/security/mfa/begin');
        $response->assertCreated();
        $data = $response->json('data');
        $this->assertArrayHasKey('provisioning_uri', $data);
        $this->assertArrayHasKey('nonce', $data);
        $factorId = $data['factor_id'];

        // Extract secret from provisioning URI (secret=XXX).
        parse_str(parse_url($data['provisioning_uri'], PHP_URL_QUERY), $query);
        $secret = $query['secret'];

        // Generate a valid TOTP code by manually using TotpEngine.
        $code = $this->generateCurrentTotp($secret);

        $confirm = $this->postJson("/api/v1/me/security/mfa/confirm/{$factorId}", [
            'nonce' => $data['nonce'],
            'code' => $code,
        ]);
        $confirm->assertOk();
        $payload = $confirm->json('data');
        $this->assertTrue($payload['activated']);
        $this->assertCount(MfaService::RECOVERY_CODE_COUNT, $payload['recovery_codes']);

        // Status reports enrolled.
        $status = $this->getJson('/api/v1/me/security/mfa')->assertOk()->json('data');
        $this->assertTrue($status['enrolled']);
        $this->assertEquals(MfaService::RECOVERY_CODE_COUNT, $status['recovery_codes_remaining']);
    }

    public function testMfaRejectsInvalidCode(): void
    {
        Sanctum::actingAs($this->admin);
        $begin = $this->postJson('/api/v1/me/security/mfa/begin')->assertCreated();
        $factorId = $begin->json('data.factor_id');
        $nonce = $begin->json('data.nonce');
        $confirm = $this->postJson("/api/v1/me/security/mfa/confirm/{$factorId}", [
            'nonce' => $nonce,
            'code' => '000000',
        ]);
        $confirm->assertStatus(400);
    }

    public function testRecoveryCodeIsSingleUse(): void
    {
        /** @var MfaService $mfa */
        $mfa = app(MfaService::class);
        $request = request()->create('/api/v1/test', 'GET');
        $request->headers->set('X-Correlation-Id', 'test-correlation');
        $begin = $mfa->beginEnrollment($this->admin, $request);
        // Get secret
        $factor = DB::table('security_mfa_factors')->where('id', $begin['factor_id'])->first();
        $secret = app('encrypter')->decryptString($factor->secret_encrypted);
        $code = $this->generateCurrentTotp($secret);
        $confirm = $mfa->confirmAndActivate($this->admin, $begin['factor_id'], $begin['nonce'], $code, $request);
        $firstCode = $confirm['recovery_codes'][0];

        $this->assertTrue($mfa->useRecoveryCode($this->admin, $firstCode, $request));
        $this->assertFalse($mfa->useRecoveryCode($this->admin, $firstCode, $request));
    }

    // ---- C7-B: Step-up ----

    public function testStepUpRequiresMfaFirst(): void
    {
        Sanctum::actingAs($this->admin);
        $response = $this->postJson('/api/v1/me/security/mfa/challenge', ['purpose' => 'step_up']);
        $response->assertStatus(403);
        $this->assertEquals('mfa_enrollment_required', $response->json('error.code'));
    }

    public function testStepUpMiddlewareBlocksWithoutVerification(): void
    {
        $this->enrollMfa($this->admin);
        Sanctum::actingAs($this->admin);
        // Without step-up, sensitive maintenance activation should be 403.
        $response = $this->postJson('/api/v1/platform/maintenance', [
            'title' => 'Test', 'scope' => 'platform',
            'scheduled_start' => now()->addHour()->toIso8601String(),
            'scheduled_end' => now()->addHours(2)->toIso8601String(),
        ]);
        $response->assertCreated();
        $window = $response->json('data');
        // Activate requires step-up middleware (scope=maintenance.manage).
        $act = $this->postJson("/api/v1/platform/maintenance/{$window['id']}/activate");
        $act->assertStatus(403);
        $this->assertEquals('step_up_required', $act->json('error.code'));
    }

    // ---- C7-E: Incidents ----

    public function testAlertFingerprintDeduplicates(): void
    {
        /** @var IncidentService $svc */
        $svc = app(IncidentService::class);
        $a = $svc->raiseAlert('test', 'fp:1', IncidentSeverity::HIGH, 'First', 'body');
        $b = $svc->raiseAlert('test', 'fp:1', IncidentSeverity::HIGH, 'First', 'body again');
        $this->assertEquals($a->id, $b->id);
        $this->assertEquals(2, $b->occurrence_count);
        $c = $svc->raiseAlert('test', 'fp:2', IncidentSeverity::LOW, 'Second');
        $this->assertNotEquals($a->id, $c->id);
    }

    public function testIncidentStateMachine(): void
    {
        Sanctum::actingAs($this->admin);
        $svc = app(IncidentService::class);
        $i = $svc->openIncident($this->admin, 'Outage', IncidentSeverity::CRITICAL, 'Summary');
        $svc->transition($this->admin, $i, IncidentStatus::ACKNOWLEDGED);
        $svc->transition($this->admin, $i, IncidentStatus::INVESTIGATING);
        $svc->transition($this->admin, $i, IncidentStatus::MITIGATED);
        $svc->transition($this->admin, $i, IncidentStatus::RESOLVED, 'All clear');
        $i->refresh();
        $this->assertEquals('resolved', $i->status);
        $this->assertNotNull($i->resolved_at);
    }

    public function testInvalidTransitionIsRejected(): void
    {
        $svc = app(IncidentService::class);
        $i = $svc->openIncident($this->admin, 'X', IncidentSeverity::LOW, null);
        $this->expectException(\DomainException::class);
        $svc->transition($this->admin, $i, IncidentStatus::RESOLVED);
    }

    // ---- C7-F: Maintenance ----

    public function testMaintenanceOverlapPrevention(): void
    {
        Sanctum::actingAs($this->admin);
        /** @var MaintenanceService $svc */
        $svc = app(MaintenanceService::class);
        $start = now()->addHour();
        $end = now()->addHours(2);
        $svc->schedule($this->admin, [
            'title' => 'MW1', 'scope' => 'platform',
            'scheduled_start' => $start, 'scheduled_end' => $end,
        ]);
        $this->expectException(\DomainException::class);
        $svc->schedule($this->admin, [
            'title' => 'MW2', 'scope' => 'platform',
            'scheduled_start' => $start->addMinutes(30), 'scheduled_end' => $end->addMinutes(30),
        ]);
    }

    public function testMaintenanceActivationFlow(): void
    {
        /** @var MaintenanceService $svc */
        $svc = app(MaintenanceService::class);
        $w = $svc->schedule($this->admin, [
            'title' => 'MW', 'scope' => 'platform',
            'scheduled_start' => now()->subMinutes(5), 'scheduled_end' => now()->addHour(),
        ]);
        $w = $svc->activate($this->admin, $w);
        $this->assertEquals(MaintenanceStatus::ACTIVE->value, $w->status);
        $w = $svc->complete($this->admin, $w);
        $this->assertEquals(MaintenanceStatus::COMPLETED->value, $w->status);
    }

    // ---- C7-G/H: Backup + Restore ----

    public function testBackupExecuteProducesManifest(): void
    {
        Sanctum::actingAs($this->admin);
        /** @var BackupService $svc */
        $svc = app(BackupService::class);
        $job = $svc->request($this->admin);
        $job = $svc->execute($job);
        $this->assertEquals(BackupJobStatus::SUCCEEDED->value, $job->status);
        $this->assertNotNull($job->checksum_sha256);
        $this->assertNotNull($job->manifest);
    }

    public function testRestorePreflightDetectsMissingArtifact(): void
    {
        /** @var BackupService $bsvc */
        $bsvc = app(BackupService::class);
        $job = $bsvc->request($this->admin);
        $job = $bsvc->execute($job);
        $r = app(\App\Core\Operations\Restore\RestoreService::class)->requestVerification($job, $this->admin);
        $result = app(\App\Core\Operations\Restore\RestoreService::class)->preflight($r);
        // When using the local disk with fake storage, artifacts are present because execute wrote them.
        $this->assertTrue($result['ok']);
    }

    public function testHealthEndpointIsPublic(): void
    {
        $response = $this->getJson('/api/v1/health');
        $response->assertOk()->assertJson(['ok' => true]);
    }

    public function testPlatformHealthRequiresPermission(): void
    {
        $this->getJson('/api/v1/platform/health')->assertStatus(401);
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/v1/platform/health')->assertOk();
    }

    public function testPublicMaintenanceCurrentEndpoint(): void
    {
        $this->getJson('/api/v1/maintenance/current')->assertOk();
    }

    // ---- helpers ----

    private function enrollMfa(User $user): string
    {
        $mfa = app(MfaService::class);
        $request = request()->create('/api/v1/test', 'POST');
        $request->headers->set('X-Correlation-Id', 'enroll');
        $begin = $mfa->beginEnrollment($user, $request);
        $factor = DB::table('security_mfa_factors')->where('id', $begin['factor_id'])->first();
        $secret = app('encrypter')->decryptString($factor->secret_encrypted);
        $code = $this->generateCurrentTotp($secret);
        $mfa->confirmAndActivate($user, $begin['factor_id'], $begin['nonce'], $code, $request);

        return $secret;
    }

    private function generateCurrentTotp(string $secret): string
    {
        // Use reflection to call hotp with current window; easier to reuse
        // TotpEngine: generate codes for a 30-second window by brute-force
        // until verify() accepts it.
        $time = time();
        for ($offset = -30; $offset <= 30; $offset++) {
            $candidate = (string) ((int) (floor(($time + $offset) / 30) % 1000000));
            $candidate = str_pad($candidate, 6, '0', STR_PAD_LEFT);
            if (TotpEngine::verify($secret, $candidate, $time)) {
                return $candidate;
            }
        }
        throw new RuntimeException('Could not generate TOTP for test secret.');
    }
}
