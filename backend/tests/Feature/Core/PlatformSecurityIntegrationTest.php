<?php

namespace Tests\Feature\Core;

use App\Core\Platform\Operations\OperationTokenSigner;
use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationException;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C2-5 — end-to-end platform authorization boundary and
 * C2-4 trust-boundary verification.
 */
class PlatformSecurityIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'integration-secret-not-for-production';

    protected function setUp(): void
    {
        parent::setUp();
        config(['platform.operations.secret' => self::SECRET]);
        PermissionCatalog::sync();
    }

    public function test_platform_authority_does_not_cross_into_workspace_http_apis(): void
    {
        $primary = $this->platformUser('sec.primary', [PlatformRoleProvisioner::PRIMARY_ROLE_KEY]);

        // The primary owns no workspace: the workspace list is empty
        // and platform endpoints work, proving the authorities are
        // disjoint over HTTP too.
        Sanctum::actingAs($primary);
        $this->getJson('/api/v1/core/workspaces')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/platform/roles')->assertOk();
    }

    public function test_legacy_admin_gets_403_on_every_platform_endpoint_group(): void
    {
        $legacyRole = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacyRole->permissions()->syncWithoutDetaching(Permission::query()->pluck('id'));
        $legacy = User::factory()->create([
            'role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active',
        ]);

        Sanctum::actingAs($legacy);
        $this->getJson('/api/v1/platform/roles')->assertForbidden()->assertJsonPath('code', 'platform_forbidden');
        $this->getJson('/api/v1/platform/users')->assertForbidden();
        $this->getJson('/api/v1/platform/organizations')->assertForbidden();
        $this->getJson('/api/v1/platform/audit-logs')->assertForbidden();
    }

    public function test_suspended_or_deactivated_platform_accounts_are_denied_by_the_api(): void
    {
        $primary = $this->platformUser('sec.suspended', [PlatformRoleProvisioner::PRIMARY_ROLE_KEY]);
        $primary->forceFill(['status' => 'suspended'])->save();

        Sanctum::actingAs($primary->fresh());
        $this->getJson('/api/v1/platform/roles')->assertForbidden();

        $primary->forceFill(['status' => 'deactivated'])->save();
        $this->getJson('/api/v1/platform/roles')->assertForbidden();
    }

    public function test_grant_ceiling_enforced_through_api_on_grant_replace_and_role_edit(): void
    {
        $manager = $this->platformUser('sec.manager', null, ['platform.admins.view', 'platform.admins.manage']);
        $rich = PlatformRole::create(['key' => 'sec_rich', 'name' => 'Rich']);
        $rich->permissions()->attach(\App\Core\Rbac\ScopedPermission::where('key', 'platform.users.view')->value('id'));
        $plain = PlatformRole::create(['key' => 'sec_plain', 'name' => 'Plain']);
        $target = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create(['user_id' => $target->id, 'platform_role_id' => $plain->id]);

        Sanctum::actingAs($manager);

        // Role edit above the ceiling.
        $this->putJson("/api/v1/platform/roles/{$plain->id}", [
            'permissions' => ['platform.users.view'], 'version' => $plain->fresh()->version,
        ])->assertStatus(422)->assertJsonPath('code', 'platform_operation_rejected');

        // Grant above the ceiling.
        $other = User::factory()->create(['status' => 'active']);
        $this->postJson('/api/v1/platform/assignments', [
            'user_id' => $other->id, 'platform_role_id' => $rich->id,
        ])->assertStatus(422);

        // Replace above the ceiling.
        $assignment = PlatformRoleAssignment::where('user_id', $target->id)->sole();
        $this->postJson("/api/v1/platform/assignments/{$assignment->id}/replace", [
            'platform_role_id' => $rich->id,
        ])->assertStatus(422);
        $this->assertNull($assignment->fresh()->revoked_at);
    }

    public function test_version_conflict_preserves_role_data(): void
    {
        $primary = $this->platformUser('sec.version', [PlatformRoleProvisioner::PRIMARY_ROLE_KEY]);
        $role = PlatformRole::create(['key' => 'sec_keep', 'name' => 'Keep Me']);

        Sanctum::actingAs($primary);
        $this->putJson("/api/v1/platform/roles/{$role->id}", [
            'name' => 'Changed', 'version' => $role->fresh()->version + 5,
        ])->assertStatus(409)->assertJsonPath('code', 'platform_role_version_conflict');

        $this->getJson("/api/v1/platform/roles/{$role->id}")->assertOk()
            ->assertJsonPath('data.name', 'Keep Me')
            ->assertJsonPath('data.version', $role->fresh()->version);
    }

    public function test_audit_endpoint_never_returns_unmasked_secrets(): void
    {
        $primary = $this->platformUser('sec.audit', [PlatformRoleProvisioner::PRIMARY_ROLE_KEY]);

        app(\App\Core\Audit\AuditWriter::class)->record($primary, 'test.sensitive', [
            'password' => 'hunter2-super-secret',
            'note' => 'visible',
            'nested' => ['api_token' => 'tok-should-hide'],
        ], 'platform');

        Sanctum::actingAs($primary);
        $response = $this->getJson('/api/v1/platform/audit-logs')->assertOk();
        $response->assertDontSee('hunter2-super-secret', false);
        $response->assertDontSee('tok-should-hide', false);
        $response->assertSee('visible', false);
    }

    public function test_no_bootstrap_or_recovery_http_routes_exist(): void
    {
        foreach (Route::getRoutes() as $route) {
            $this->assertStringNotContainsString('bootstrap', $route->uri());
            $this->assertStringNotContainsString('platform/recovery', $route->uri());
            $this->assertStringNotContainsString('platform/operations', $route->uri());
        }

        $primary = $this->platformUser('sec.routes', [PlatformRoleProvisioner::PRIMARY_ROLE_KEY]);
        Sanctum::actingAs($primary);
        $this->postJson('/api/v1/platform/bootstrap', [])->assertNotFound();
        $this->postJson('/api/v1/platform/operations/execute', [])->assertNotFound();
        $this->postJson('/api/v1/platform/operations/issue', [])->assertNotFound();
    }

    public function test_token_payload_tampering_and_wrong_secret_fail_closed(): void
    {
        $token = $this->sign(['op' => 'bootstrap', 'target_username' => 'victim.user', 'operator' => 'infra:real']);
        [$body, $signature] = explode('.', $token);

        // Rebinding target/operator after signing breaks the signature.
        $payload = json_decode(OperationTokenSigner::base64UrlDecode($body), true);
        $payload['target_username'] = 'attacker.user';
        $payload['operator'] = 'infra:attacker';
        $forged = OperationTokenSigner::base64UrlEncode(json_encode($payload)).'.'.$signature;
        $this->assertVerificationFails('token_signature_invalid', $forged);

        // Changing the operation type breaks it too.
        $payload['target_username'] = 'victim.user';
        $payload['op'] = 'recovery';
        $forged = OperationTokenSigner::base64UrlEncode(json_encode($payload)).'.'.$signature;
        $this->assertVerificationFails('token_signature_invalid', $forged);

        // A token signed with any other key is worthless here.
        $foreign = OperationTokenSigner::sign([
            'op' => 'bootstrap', 'request_id' => 'x', 'operator' => 'infra:x',
            'target_username' => 'victim.user', 'iat' => time(), 'exp' => time() + 600,
        ], 'a-different-secret');
        $this->assertVerificationFails('token_signature_invalid', $foreign);
    }

    public function test_processor_only_reads_the_configured_directory_and_outputs_no_secrets(): void
    {
        $base = sys_get_temp_dir().'/tadbir-ops-'.uniqid();
        $configured = $base.'/configured';
        $outside = $base.'/outside';
        mkdir($configured, 0777, true);
        mkdir($outside, 0777, true);
        config(['platform.operations.directory' => $configured]);

        try {
            User::factory()->create(['username' => 'proc.user', 'status' => 'active']);
            $token = $this->sign(['op' => 'bootstrap', 'target_username' => 'proc.user', 'operator' => 'infra:proc']);
            file_put_contents($outside.'/drop.opreq', $token);

            // A request dropped outside the configured directory is
            // ignored entirely — filesystem presence elsewhere has
            // no authority.
            Artisan::call('platform:operations:process');
            $this->assertFileExists($outside.'/drop.opreq');
            $this->assertSame(0, PlatformRoleAssignment::count());
            $this->assertStringNotContainsString(self::SECRET, Artisan::output());
            $this->assertStringNotContainsString($token, Artisan::output());

            // Inside the configured directory it executes exactly once.
            file_put_contents($configured.'/drop.opreq', $token);
            Artisan::call('platform:operations:process');
            $this->assertSame(1, PlatformRoleAssignment::count());
            $this->assertFileDoesNotExist($configured.'/drop.opreq');
            $this->assertFileExists($configured.'/processed/drop.opreq.done');
            $output = Artisan::output();
            $this->assertStringNotContainsString(self::SECRET, $output);
            $this->assertStringNotContainsString($token, $output);
        } finally {
            Auth::forgetGuards();
            \Illuminate\Support\Facades\File::deleteDirectory($base);
        }
    }

    public function test_execute_command_output_contains_no_secret_or_token(): void
    {
        User::factory()->create(['username' => 'cli.leak', 'status' => 'active']);
        $token = $this->sign(['op' => 'bootstrap', 'target_username' => 'cli.leak', 'operator' => 'infra:leak']);

        Artisan::call('platform:operations:execute', ['token' => $token]);
        $output = Artisan::output();
        $this->assertSame(1, PlatformRoleAssignment::count());
        $this->assertStringNotContainsString(self::SECRET, $output);
        $this->assertStringNotContainsString($token, $output);

        // Issuance prints the token (the operator channel) but never
        // the secret.
        Artisan::call('platform:operations:issue', [
            '--operation' => 'bootstrap', '--target' => 'cli.leak', '--operator' => 'infra:leak',
        ]);
        $this->assertStringNotContainsString(self::SECRET, Artisan::output());
    }

    /**
     * @param  list<string>  $permissionKeys
     */
    private function platformUser(string $username, ?array $roleMarker, array $permissionKeys = []): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        if ($roleMarker === [PlatformRoleProvisioner::PRIMARY_ROLE_KEY]) {
            $role = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        } else {
            $role = PlatformRole::create(['key' => 'sec_'.uniqid(), 'name' => 'Sec']);
            $role->permissions()->attach(
                \App\Core\Rbac\ScopedPermission::whereIn('key', $permissionKeys)->pluck('id'),
            );
        }
        PlatformRoleAssignment::create(['user_id' => $user->id, 'platform_role_id' => $role->id]);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function sign(array $payload): string
    {
        return OperationTokenSigner::sign(array_merge([
            'request_id' => 'sec-'.uniqid(),
            'iat' => time(),
            'exp' => time() + 600,
        ], $payload), self::SECRET);
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
