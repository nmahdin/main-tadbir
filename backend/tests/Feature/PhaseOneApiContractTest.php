<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhaseOneApiContractTest extends TestCase
{
    use RefreshDatabase;

    private function actor(): User
    {
        $role = Role::create(['key' => 'phase_one', 'name' => 'Phase one', 'is_active' => true]);
        foreach (['projects.view', 'projects.create', 'projects.edit', 'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.status'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_health_does_not_disclose_database_name(): void
    {
        $this->getJson('/api/v1/health/db')->assertOk()->assertJsonPath('ok', true)
            ->assertJsonMissingPath('database')->assertJsonMissingPath('host')->assertJsonMissingPath('username');
    }

    public function test_api_internal_errors_are_safe_even_when_debug_is_enabled(): void
    {
        config(['app.debug' => true]);
        Route::get('/api/v1/phase-one-error', fn () => throw new \RuntimeException('SQLSTATE password=private-example'));
        $this->getJson('/api/v1/phase-one-error')->assertStatus(500)->assertJsonStructure(['message'])
            ->assertJsonMissingPath('trace')->assertJsonMissingPath('exception')->assertDontSee('private-example');
    }

    public function test_browser_login_creates_a_server_session_cookie_without_returning_a_token(): void
    {
        config([
            'session.cookie' => 'tadbir_session',
            'session.domain' => '.morvarid-daron.ir',
            'session.secure' => true,
        ]);
        $user = User::factory()->create(['username' => 'phase.browser', 'status' => 'active', 'password' => 'test-password-123']);

        $response = $this->withHeaders([
            'Origin' => 'https://tadbir.morvarid-daron.ir',
            'Referer' => 'https://tadbir.morvarid-daron.ir/login',
        ])->postJson('/api/v1/auth/login', [
            'login' => 'phase.browser',
            'password' => 'test-password-123',
            'remember' => true,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.id', (string) $user->id)
            ->assertJsonMissingPath('token')
            ->assertCookie('tadbir_session')
            ->assertCookie('XSRF-TOKEN')
            ->assertHeader('Cache-Control', 'no-store, private');
        $sessionCookie = $response->getCookie('tadbir_session', false);
        $this->assertSame('.morvarid-daron.ir', $sessionCookie->getDomain());
        $this->assertTrue($sessionCookie->isSecure());
        $this->assertTrue($sessionCookie->isHttpOnly());
        $this->assertSame('lax', $sessionCookie->getSameSite());
        $this->assertAuthenticatedAs($user, 'web');
        $this->assertDatabaseCount('personal_access_tokens', 0);

        // Forget the in-memory guard so the next request must authenticate from
        // the backend-issued cookie, exactly like a separate browser request.
        $sessionId = $response->getCookie('tadbir_session')->getValue();
        Auth::forgetGuards();
        $this->withCookie('tadbir_session', $sessionId)
            ->withHeaders([
                'Origin' => 'https://tadbir.morvarid-daron.ir',
                'Referer' => 'https://tadbir.morvarid-daron.ir/dashboard',
            ])
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', (string) $user->id);
    }

    public function test_non_browser_clients_receive_tokens_only_from_the_dedicated_endpoint(): void
    {
        $user = User::factory()->create(['username' => 'phase.token', 'status' => 'active', 'password' => 'test-password-123']);
        $token = $this->postJson('/api/v1/auth/token', ['login' => 'phase.token', 'password' => 'test-password-123'])
            ->assertOk()->assertJsonPath('data.id', (string) $user->id)->json('token');
        $this->assertNotEmpty($token);
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_wrong_password_has_field_errors_and_rate_limit_uses_429(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['login' => 'phase.bad', 'password' => 'wrong-password'])
                ->assertUnprocessable()->assertJsonValidationErrors('login');
        }
        $this->postJson('/api/v1/auth/login', ['login' => 'phase.bad', 'password' => 'wrong-password'])
            ->assertStatus(429)->assertHeader('Retry-After');
    }

    public function test_registration_is_rate_limited_before_expensive_work(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/register', [])->assertUnprocessable();
        }
        $this->postJson('/api/v1/auth/register', [])->assertStatus(429);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_unauthenticated_inactive_and_unprivileged_clients_are_denied(): void
    {
        $this->getJson('/api/v1/projects')->assertUnauthorized();
        $user = User::factory()->create(['status' => 'inactive']);
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/projects')->assertForbidden();
        $user->update(['status' => 'active', 'role_key' => 'no-role']);
        Sanctum::actingAs($user->fresh());
        $this->postJson('/api/v1/projects', ['name' => 'Forbidden'])->assertForbidden();
    }

    public function test_validation_pagination_missing_record_archive_and_restore(): void
    {
        $actor = $this->actor();
        $this->postJson('/api/v1/projects', [])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/tasks', [])->assertUnprocessable()->assertJsonValidationErrors('title');
        $id = $this->postJson('/api/v1/projects', ['name' => 'Phase One', 'status' => 'active'])
            ->assertCreated()->json('data.id');
        $this->patchJson('/api/v1/projects/'.$id, ['status' => 'archived'])->assertOk()->assertJsonPath('data.status', 'archived');
        $this->getJson('/api/v1/projects/'.$id)->assertJsonPath('data.status', 'archived');
        $this->patchJson('/api/v1/projects/'.$id, ['status' => 'active'])->assertOk();
        $this->getJson('/api/v1/projects?per_page=1')->assertOk()->assertJsonPath('meta.current_page', 1)->assertJsonPath('meta.total', 1);
        $task = $this->postJson('/api/v1/tasks', ['title' => 'Phase task', 'assigneeId' => $actor->id])->assertCreated()->json('data.id');
        $this->patchJson('/api/v1/tasks/'.$task.'/status', ['status' => 'archived'])->assertOk();
        $this->patchJson('/api/v1/tasks/'.$task.'/status', ['status' => 'backlog'])->assertOk();
        $this->getJson('/api/v1/tasks/'.$task)->assertJsonPath('data.status', 'backlog');
        $this->getJson('/api/v1/projects/999999')->assertNotFound()->assertJsonStructure(['message']);
    }
}
