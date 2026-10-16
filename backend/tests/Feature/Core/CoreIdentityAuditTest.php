<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Audit\AuditWriter;
use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Identity\AccountLifecycle;
use App\Core\Identity\AccountLifecycleException;
use App\Core\Identity\AccountStatus;
use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use LogicException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Stage C1 — identity normalization, account lifecycle, minimal audit.
 *
 * Proves the new suspended/deactivated lifecycle does not change
 * legacy active/inactive/blocked/pending semantics, that suspended
 * and deactivated accounts lose access on every surface (including
 * already-issued tokens), that deactivation ends memberships
 * transactionally without violating final-manager protection, and
 * that audit records are transactional, masked and immutable.
 */
class CoreIdentityAuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_statuses_keep_their_semantics_and_only_active_may_access(): void
    {
        foreach (['inactive', 'blocked', 'pending'] as $status) {
            $user = User::factory()->create(['status' => $status]);
            $this->assertFalse($user->isActive(), $status);
            $this->assertFalse(AccountStatus::of($status)->allowsOperationalAccess());

            Sanctum::actingAs($user);
            $this->getJson('/api/v1/auth/me')->assertForbidden();
        }

        $pending = User::factory()->create([
            'username' => 'pending-user',
            'password' => Hash::make('secret-password'),
            'status' => 'pending',
        ]);
        $this->postJson('/api/v1/auth/login', ['login' => 'pending-user', 'password' => 'secret-password'])
            ->assertForbidden();
        // Never silently activated.
        $this->assertSame('pending', $pending->fresh()->status);

        $blocked = User::factory()->create([
            'username' => 'blocked-user',
            'password' => Hash::make('secret-password'),
            'status' => 'blocked',
        ]);
        $this->postJson('/api/v1/auth/login', ['login' => 'blocked-user', 'password' => 'secret-password'])
            ->assertForbidden();
        $this->assertSame('blocked', $blocked->fresh()->status);
        $this->assertTrue(AccountStatus::of('blocked')->isLegacy());
        $this->assertFalse(AccountStatus::of('suspended')->isLegacy());
    }

    public function test_lifecycle_transitions_and_invalid_transitions(): void
    {
        $admin = $this->admin();
        $user = User::factory()->create(['status' => 'active']);
        $lifecycle = app(AccountLifecycle::class);

        $lifecycle->suspend($admin, $user, 'policy violation');
        $this->assertSame('suspended', $user->fresh()->status);

        $lifecycle->restore($admin, $user);
        $this->assertSame('active', $user->fresh()->status);

        // Restore is only valid from suspended.
        $this->expectException(AccountLifecycleException::class);
        $lifecycle->restore($admin, $user);
    }

    public function test_deactivation_is_terminal_and_pending_cannot_be_suspended(): void
    {
        $admin = $this->admin();
        $lifecycle = app(AccountLifecycle::class);

        $pending = User::factory()->create(['status' => 'pending']);
        try {
            $lifecycle->suspend($admin, $pending);
            $this->fail('Pending accounts must not be suspended into a parallel state.');
        } catch (AccountLifecycleException) {
            $this->assertSame('pending', $pending->fresh()->status);
        }

        $user = User::factory()->create(['status' => 'active']);
        $lifecycle->deactivate($admin, $user);
        $this->assertSame('deactivated', $user->fresh()->status);

        $this->expectException(AccountLifecycleException::class);
        $lifecycle->restore($admin, $user);
    }

    public function test_suspension_revokes_existing_tokens_and_blocks_access(): void
    {
        $admin = $this->admin();
        $user = User::factory()->create(['status' => 'active']);
        $token = $user->createToken('device')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/me')->assertOk();

        // Service-level on purpose: the raw bearer request below must
        // not inherit Sanctum::actingAs state. Endpoint authorization
        // is covered by the neighboring tests.
        app(AccountLifecycle::class)->suspend($admin, $user, 'abuse');
        $this->assertSame('suspended', $user->fresh()->status);

        $this->assertDatabaseCount('personal_access_tokens', 0);
        // The test application caches guard users across requests;
        // forget guards so the revoked bearer token is re-resolved.
        $this->app->make('auth')->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/auth/me')->assertUnauthorized();

        // A re-resolved authorization decision also denies by account state.
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user->fresh());
        try {
            app(AuthorizationService::class)->authorize($user->fresh(), $workspace->id, 'workspace.view');
            $this->fail('Suspended account must not authorize.');
        } catch (AuthorizationDeniedException $exception) {
            $this->assertSame(AuthorizationDeniedException::ACCOUNT_INACTIVE, $exception->reason());
        }
    }

    public function test_lifecycle_endpoint_requires_status_authority(): void
    {
        $plain = User::factory()->create(['status' => 'active']);
        $target = User::factory()->create(['status' => 'active']);

        Sanctum::actingAs($plain);
        $this->postJson("/api/v1/users/{$target->id}/account-lifecycle", ['action' => 'suspend'])
            ->assertForbidden();
        $this->assertSame('active', $target->fresh()->status);

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/v1/users/{$target->id}/account-lifecycle", ['action' => 'suspend', 'reason' => 'review'])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');
    }

    public function test_deactivation_ends_memberships_transactionally_and_preserves_history(): void
    {
        $admin = $this->admin();
        [$owner, $workspace] = $this->workspaceOwner();
        $member = User::factory()->create(['status' => 'active']);
        $membership = $this->addMember($workspace, $member);

        app(AccountLifecycle::class)->deactivate($admin, $member);

        $ended = $membership->fresh();
        $this->assertSame(MembershipStatus::Ended, $ended->status);
        $this->assertNull($ended->role_id);
        $this->assertNotNull($ended->ended_at);
        // The historical row and the other member are preserved.
        $this->assertDatabaseHas('workspace_memberships', ['id' => $membership->id]);
        $this->assertSame('active', $owner->fresh()->status);
        $this->assertTrue(WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $owner->id)->first()->isActive());
    }

    public function test_deactivation_of_final_manager_rolls_back_everything_including_audit(): void
    {
        $admin = $this->admin();
        [$owner, $workspace] = $this->workspaceOwner();

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/users/{$owner->id}/account-lifecycle", ['action' => 'deactivate'])
            ->assertUnprocessable();

        $this->assertSame('active', $owner->fresh()->status);
        $this->assertTrue(WorkspaceMembership::where('workspace_id', $workspace->id)
            ->where('user_id', $owner->id)->first()->isActive());
        $this->assertDatabaseMissing('audit_logs', [
            'action' => 'identity.account_deactivated',
            'target_id' => $owner->id,
        ]);
    }

    public function test_audit_records_are_created_for_successful_identity_mutations(): void
    {
        $admin = $this->admin();
        $user = User::factory()->create(['status' => 'active']);
        $lifecycle = app(AccountLifecycle::class);

        $lifecycle->suspend($admin, $user, 'review');
        $lifecycle->restore($admin, $user);
        $lifecycle->deactivate($admin, $user);

        foreach (['identity.account_suspended', 'identity.account_restored', 'identity.account_deactivated'] as $action) {
            $this->assertDatabaseHas('audit_logs', [
                'action' => $action,
                'actor_user_id' => $admin->id,
                'target_type' => 'user',
                'target_id' => $user->id,
            ]);
        }
        $row = AuditLog::where('action', 'identity.account_suspended')->first();
        $this->assertSame('active', $row->summary['from']);
        $this->assertSame('suspended', $row->summary['to']);
    }

    public function test_legacy_status_change_through_user_administration_is_audited(): void
    {
        $admin = $this->admin();
        $user = User::factory()->create(['status' => 'active']);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/users/{$user->id}", ['status' => 'inactive'])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'identity.account_status_changed',
            'target_id' => $user->id,
        ]);
    }

    public function test_audit_masking_and_immutability(): void
    {
        $writer = app(AuditWriter::class);
        $row = $writer->record(null, 'test.event', [
            'password' => 'super-secret',
            'nested' => ['api_token' => 'abc123', 'note' => 'visible'],
        ]);

        $fresh = $row->fresh();
        $this->assertSame('***', $fresh->summary['password']);
        $this->assertSame('***', $fresh->summary['nested']['api_token']);
        $this->assertSame('visible', $fresh->summary['nested']['note']);

        try {
            $fresh->update(['action' => 'tampered']);
            $this->fail('Audit records must be immutable.');
        } catch (LogicException) {
            $this->assertSame('test.event', $fresh->fresh()->action);
        }
        $this->expectException(LogicException::class);
        $fresh->delete();
    }

    public function test_deactivation_keeps_other_workspaces_untouched(): void
    {
        $admin = $this->admin();
        [, $workspaceA] = $this->workspaceOwner();
        [, $workspaceB] = $this->workspaceOwner();
        $member = User::factory()->create(['status' => 'active']);
        $inA = $this->addMember($workspaceA, $member);
        $inB = $this->addMember($workspaceB, $member);

        // Suspending (not deactivating) ends nothing in either workspace.
        app(AccountLifecycle::class)->suspend($admin, $member);
        $this->assertTrue($inA->fresh()->isActive());
        $this->assertTrue($inB->fresh()->isActive());

        app(AccountLifecycle::class)->restore($admin, $member);
        app(AccountLifecycle::class)->deactivate($admin, $member);
        $this->assertSame(MembershipStatus::Ended, $inA->fresh()->status);
        $this->assertSame(MembershipStatus::Ended, $inB->fresh()->status);
    }

    public function test_legacy_user_administration_cannot_override_core_lifecycle_states(): void
    {
        $admin = $this->admin();
        $lifecycle = app(AccountLifecycle::class);
        $deactivated = User::factory()->create(['status' => 'active']);
        $lifecycle->deactivate($admin, $deactivated);
        $suspended = User::factory()->create(['status' => 'active']);
        $lifecycle->suspend($admin, $suspended);

        Sanctum::actingAs($admin);
        // Deactivated is terminal on every write path.
        $this->patchJson("/api/v1/users/{$deactivated->id}", ['status' => 'active'])->assertUnprocessable();
        $this->assertSame('deactivated', $deactivated->fresh()->status);
        // Suspended changes state only through the lifecycle restore.
        $this->patchJson("/api/v1/users/{$suspended->id}", ['status' => 'active'])->assertUnprocessable();
        $this->assertSame('suspended', $suspended->fresh()->status);

        // Legitimate legacy approval flow still works.
        $pending = User::factory()->create(['status' => 'pending']);
        $this->patchJson("/api/v1/users/{$pending->id}", ['status' => 'active'])->assertOk();
        $this->assertSame('active', $pending->fresh()->status);
    }

    public function test_only_active_accounts_can_be_suspended_so_prior_status_is_never_discarded(): void
    {
        $admin = $this->admin();
        $lifecycle = app(AccountLifecycle::class);

        foreach (['blocked', 'inactive'] as $status) {
            $user = User::factory()->create(['status' => $status]);
            try {
                $lifecycle->suspend($admin, $user);
                $this->fail("Suspending a {$status} account must be rejected.");
            } catch (AccountLifecycleException) {
                $this->assertSame($status, $user->fresh()->status);
            }
        }
    }

    public function test_final_legacy_admin_cannot_be_suspended_or_deactivated_including_self_targeting(): void
    {
        $admin = $this->admin();
        $token = $admin->createToken('device')->plainTextToken;
        [$owner, $workspace] = $this->workspaceOwner();
        $membership = $this->addMember($workspace, $admin);
        $lifecycle = app(AccountLifecycle::class);

        foreach (['suspend', 'deactivate'] as $method) {
            try {
                $lifecycle->{$method}($admin, $admin->fresh());
                $this->fail("The final active legacy admin must not be {$method}ed.");
            } catch (HttpException $exception) {
                $this->assertSame(422, $exception->getStatusCode());
            }
            // Failed transitions preserve everything.
            $this->assertSame('active', $admin->fresh()->status);
            $this->assertDatabaseCount('personal_access_tokens', 1);
            $this->assertTrue($membership->fresh()->isActive());
            $this->assertDatabaseMissing('audit_logs', ['target_id' => $admin->id]);
        }

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/users/{$admin->id}/account-lifecycle", ['action' => 'suspend'])
            ->assertUnprocessable();
        $this->assertSame('active', $admin->fresh()->status);
        $this->assertNotNull($token);
    }

    public function test_second_active_admin_permits_transition_and_then_becomes_protected(): void
    {
        $first = $this->admin();
        $second = $this->admin();
        $lifecycle = app(AccountLifecycle::class);

        $lifecycle->suspend($second, $first);
        $this->assertSame('suspended', $first->fresh()->status);

        // Now the second admin is the final active one.
        try {
            $lifecycle->deactivate($second, $second->fresh());
            $this->fail('The now-final active admin must be protected.');
        } catch (HttpException $exception) {
            $this->assertSame(422, $exception->getStatusCode());
        }
        $this->assertSame('active', $second->fresh()->status);
    }

    public function test_web_session_is_revoked_on_suspend_and_restore_does_not_resurrect_it(): void
    {
        config(['session.driver' => 'database', 'session.cookie' => 'tadbir_session']);
        $admin = $this->admin();
        $user = User::factory()->create([
            'username' => 'web.user',
            'status' => 'active',
            'password' => 'test-password-123',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'login' => 'web.user',
            'password' => 'test-password-123',
            'remember' => true,
        ])->assertOk();
        $sessionCookie = $response->getCookie('tadbir_session')->getValue();
        $rememberBefore = $user->fresh()->remember_token;
        $this->assertNotEmpty($rememberBefore);
        $this->assertDatabaseHas('sessions', ['user_id' => $user->id]);

        Auth::forgetGuards();
        $this->withCookie('tadbir_session', $sessionCookie)
            ->getJson('/api/v1/auth/me')->assertOk();

        app(AccountLifecycle::class)->suspend($admin, $user->fresh());

        // Session rows deleted and remember-me credential rotated.
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertNotSame($rememberBefore, $user->fresh()->remember_token);

        // Forget guards AND the session manager: a real browser
        // request runs in a fresh process, while the test app keeps
        // the loaded session store instance in memory.
        Auth::forgetGuards();
        $this->app->forgetInstance('session');
        $this->withCookie('tadbir_session', $sessionCookie)
            ->getJson('/api/v1/auth/me')->assertUnauthorized();

        // Restore must not resurrect the revoked session.
        app(AccountLifecycle::class)->restore($admin, $user->fresh());
        Auth::forgetGuards();
        $this->app->forgetInstance('session');
        $this->withCookie('tadbir_session', $sessionCookie)
            ->getJson('/api/v1/auth/me')->assertUnauthorized();

        // A fresh login is required — and works.
        $this->postJson('/api/v1/auth/login', [
            'login' => 'web.user',
            'password' => 'test-password-123',
        ])->assertOk();
    }

    private function admin(): User
    {
        $role = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        foreach (['users.view', 'users.edit', 'users.status'] as $key) {
            $role->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
                ['key' => $key],
                ['label' => $key, 'category' => 'tests'],
            ));
        }

        return User::factory()->create(['role_id' => $role->id, 'role_key' => 'admin', 'status' => 'active']);
    }

    /**
     * @return array{0: User, 1: Workspace}
     */
    private function workspaceOwner(): array
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        return [$owner, $workspace];
    }

    private function addMember(Workspace $workspace, User $user): WorkspaceMembership
    {
        $membership = WorkspaceMembership::create([
            'workspace_id' => $workspace->id,
            'user_id' => $user->id,
            'status' => MembershipStatus::Active,
        ]);
        app(WorkspaceRoleService::class)->assignSystemRole(
            $membership,
            app(RoleProvisioner::class)->workspaceMember($workspace),
        );

        return $membership->refresh();
    }
}
