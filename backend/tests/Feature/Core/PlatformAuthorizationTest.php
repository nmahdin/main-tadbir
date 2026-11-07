<?php

namespace Tests\Feature\Core;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Identity\AccountLifecycle;
use App\Core\Platform\PlatformAssignmentService;
use App\Core\Platform\PlatformAuthorizationException;
use App\Core\Platform\PlatformAuthorizer;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Platform\PlatformRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacValidationException;
use App\Core\Rbac\ScopedPermission;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stage C2-2 — platform authorization and role/assignment services.
 *
 * Concurrency proofs for the control-row lock live in
 * PlatformConcurrencyMysqlTest; SQLite proves the logic.
 */
class PlatformAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private PlatformRole $primaryRole;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        $this->primaryRole = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
    }

    public function test_authorizer_fails_closed(): void
    {
        $authorizer = app(PlatformAuthorizer::class);
        $plain = User::factory()->create(['status' => 'active']);

        $this->assertSame([], $authorizer->permissionsFor($plain));
        $this->assertFalse($authorizer->allows($plain, 'platform.users.view'));

        $primary = $this->makePrimary();
        $this->assertTrue($authorizer->allows($primary, 'platform.users.view'));
        $this->assertFalse($authorizer->allows($primary, 'workspace.view'));
        $this->assertFalse($authorizer->allows($primary, 'platform.nonexistent'));
        $this->assertTrue($authorizer->isPrimaryAdministrator($primary));

        // Suspended accounts evaluate to no authority at all.
        $primary->forceFill(['status' => 'suspended'])->save();
        $this->assertSame([], $authorizer->permissionsFor($primary->fresh()));
    }

    public function test_grant_requires_authority_and_writes_audit(): void
    {
        $actor = $this->makePrimary();
        $target = User::factory()->create(['status' => 'active']);
        $role = $this->roleWith(['platform.users.view'], 'support_viewer');

        $assignment = app(PlatformAssignmentService::class)->grant($actor, $target, $role);
        $this->assertTrue($assignment->isActive());
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'platform.role_granted',
            'actor_user_id' => $actor->id,
            'target_id' => $target->id,
        ]);

        $plain = User::factory()->create(['status' => 'active']);
        $other = User::factory()->create(['status' => 'active']);
        $this->expectException(PlatformAuthorizationException::class);
        app(PlatformAssignmentService::class)->grant($plain, $other, $role);
    }

    public function test_grant_ceiling_self_grant_and_duplicate_grant_are_rejected(): void
    {
        $limited = $this->actorWith(['platform.admins.manage', 'platform.users.view'], 'limited_admin');
        $target = User::factory()->create(['status' => 'active']);
        $tooWide = $this->roleWith(['platform.audit.view'], 'auditor');

        try {
            app(PlatformAssignmentService::class)->grant($limited, $target, $tooWide);
            $this->fail('Grant beyond the actor ceiling must be rejected.');
        } catch (RbacValidationException) {
            $this->addToAssertionCount(1);
        }

        $primary = $this->makePrimary();
        try {
            app(PlatformAssignmentService::class)->grant($primary, $primary, $tooWide);
            $this->fail('Self-grant must be rejected.');
        } catch (PlatformAuthorizationException) {
            $this->addToAssertionCount(1);
        }

        app(PlatformAssignmentService::class)->grant($primary, $target, $tooWide);
        $this->expectException(RbacValidationException::class);
        app(PlatformAssignmentService::class)->grant($primary, $target, $tooWide);
    }

    public function test_only_primary_administrators_may_grant_the_primary_role(): void
    {
        $manager = $this->actorWith(['platform.admins.manage'], 'admins_manager');
        $target = User::factory()->create(['status' => 'active']);

        try {
            app(PlatformAssignmentService::class)->grant($manager, $target, $this->primaryRole);
            $this->fail('Non-primary actors must not grant the primary role.');
        } catch (PlatformAuthorizationException) {
            $this->addToAssertionCount(1);
        }

        $primary = $this->makePrimary();
        app(PlatformAssignmentService::class)->grant($primary, $target, $this->primaryRole);
        $this->assertTrue(app(PlatformAuthorizer::class)->isPrimaryAdministrator($target->fresh()));
    }

    public function test_revoke_self_revoke_and_final_primary_protection(): void
    {
        $primaryA = $this->makePrimary();
        $primaryB = $this->makePrimary();
        $manager = $this->actorWith(['platform.admins.manage'], 'revoke_manager');
        $service = app(PlatformAssignmentService::class);

        $assignmentA = $this->activeAssignment($primaryA);
        $service->revoke($manager, $assignmentA);
        $this->assertNotNull($assignmentA->fresh()->revoked_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'platform.role_revoked', 'target_id' => $primaryA->id]);

        // B is now the last usable primary: service revoke refuses.
        try {
            $service->revoke($manager, $this->activeAssignment($primaryB));
            $this->fail('Revoking the last usable primary must be rejected.');
        } catch (RbacValidationException) {
            $this->assertNull($this->activeAssignment($primaryB)->revoked_at);
        }

        // Self-revocation is prohibited even for a primary.
        $this->expectException(PlatformAuthorizationException::class);
        $service->revoke($primaryB, $this->activeAssignment($primaryB));
    }

    public function test_replacement_is_atomic_and_rolls_back_on_guard_failure(): void
    {
        $primary = $this->makePrimary();
        $manager = $this->actorWith(['platform.admins.manage'], 'replace_manager');
        $service = app(PlatformAssignmentService::class);
        $custom = $this->roleWith(['platform.users.view'], 'replace_target_role');

        // Successful replacement.
        $holder = User::factory()->create(['status' => 'active']);
        $service->grant($primary, $holder, $custom);
        $wider = $this->roleWith(['platform.users.view', 'platform.audit.view'], 'replace_wider_role');
        $new = $service->replace($primary, $holder, $wider);
        $this->assertSame($wider->id, (int) $new->platform_role_id);
        $this->assertSame(1, PlatformRoleAssignment::where('user_id', $holder->id)->whereNull('revoked_at')->count());
        $this->assertSame(1, PlatformRoleAssignment::where('user_id', $holder->id)->whereNotNull('revoked_at')->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'platform.role_replaced', 'target_id' => $holder->id]);

        // Replacing the last primary's role with a non-primary role
        // must roll back completely.
        try {
            $service->replace($manager, $primary, $custom);
            $this->fail('Replacing away the last primary role must be rejected.');
        } catch (RbacValidationException) {
            $active = $this->activeAssignment($primary);
            $this->assertSame((int) $this->primaryRole->id, (int) $active->platform_role_id);
            $this->assertNull($active->revoked_at);
        }
    }

    public function test_role_management_ceiling_protection_and_self_modification(): void
    {
        $primary = $this->makePrimary();
        $service = app(PlatformRoleService::class);

        $role = $service->createCustomRole($primary, 'ops_viewer', 'Ops Viewer', ['platform.users.view']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'platform.role_created', 'target_id' => $role->id]);

        try {
            $service->createCustomRole($primary, 'bad_scope', 'Bad', ['workspace.view']);
            $this->fail('Cross-scope keys must be rejected.');
        } catch (RbacValidationException) {
            $this->addToAssertionCount(1);
        }

        // Protected primary role cannot be edited or deleted.
        try {
            $service->updateRolePermissions($primary, $this->primaryRole, ['platform.users.view']);
            $this->fail('Protected role edits must be rejected.');
        } catch (RbacValidationException) {
            $this->addToAssertionCount(1);
        }
        try {
            $service->deleteRole($primary, $this->primaryRole);
            $this->fail('Protected role deletion must be rejected.');
        } catch (RbacValidationException) {
            $this->addToAssertionCount(1);
        }

        // Permission edits enforce the ceiling (they affect assignees).
        $limited = $this->actorWith(['platform.admins.manage'], 'role_editor');
        try {
            $service->updateRolePermissions($limited, $role, ['platform.audit.view']);
            $this->fail('Role permission edits beyond the actor ceiling must be rejected.');
        } catch (RbacValidationException) {
            $this->addToAssertionCount(1);
        }

        // An actor cannot edit a role they themselves hold.
        $holder = $this->actorWith(['platform.admins.manage', 'platform.users.view'], 'self_editor');
        $heldRole = $this->activeAssignment($holder)->role;
        $this->expectException(PlatformAuthorizationException::class);
        $service->updateRolePermissions($holder, $heldRole, ['platform.users.view']);
    }

    public function test_role_with_assignment_history_cannot_be_deleted(): void
    {
        $primary = $this->makePrimary();
        $role = $this->roleWith(['platform.users.view'], 'history_role');
        $holder = User::factory()->create(['status' => 'active']);
        app(PlatformAssignmentService::class)->grant($primary, $holder, $role);
        app(PlatformAssignmentService::class)->revoke($primary, $this->activeAssignment($holder));

        $this->expectException(RbacValidationException::class);
        app(PlatformRoleService::class)->deleteRole($primary, $role);
    }

    public function test_lifecycle_protects_the_final_usable_primary(): void
    {
        $legacyAdmin = $this->legacyAdmin();
        $primaryA = $this->makePrimary();
        $primaryB = $this->makePrimary();
        $lifecycle = app(AccountLifecycle::class);

        $lifecycle->suspend($legacyAdmin, $primaryA);
        $this->assertSame('suspended', $primaryA->fresh()->status);
        // Suspended primaries lose all platform authority immediately.
        $this->assertSame([], app(PlatformAuthorizer::class)->permissionsFor($primaryA->fresh()));

        try {
            $lifecycle->suspend($legacyAdmin, $primaryB);
            $this->fail('Suspending the final usable primary must be rejected.');
        } catch (RbacValidationException) {
            $this->assertSame('active', $primaryB->fresh()->status);
        }

        try {
            $lifecycle->deactivate($legacyAdmin, $primaryB);
            $this->fail('Deactivating the final usable primary must be rejected.');
        } catch (RbacValidationException) {
            $this->assertSame('active', $primaryB->fresh()->status);
        }
    }

    public function test_platform_authority_never_grants_workspace_access(): void
    {
        $primary = $this->makePrimary();
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $this->expectException(AuthorizationDeniedException::class);
        app(AuthorizationService::class)->authorize($primary, $workspace->id, 'workspace.view');
    }

    private function makePrimary(): User
    {
        $user = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::create([
            'user_id' => $user->id,
            'platform_role_id' => $this->primaryRole->id,
        ]);

        return $user;
    }

    /**
     * @param  list<string>  $keys
     */
    private function actorWith(array $keys, string $roleKey): User
    {
        $role = $this->roleWith($keys, $roleKey);
        $user = User::factory()->create(['status' => 'active']);
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
        $role->permissions()->attach(
            ScopedPermission::whereIn('key', $keys)->pluck('id')->all(),
        );

        return $role;
    }

    private function activeAssignment(User $user): PlatformRoleAssignment
    {
        return PlatformRoleAssignment::where('user_id', $user->id)
            ->whereNull('revoked_at')
            ->firstOrFail();
    }

    private function legacyAdmin(): User
    {
        $role = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $role->permissions()->syncWithoutDetaching(Permission::firstOrCreate(
            ['key' => 'users.status'],
            ['label' => 'users.status', 'category' => 'tests'],
        ));

        return User::factory()->create(['role_id' => $role->id, 'role_key' => 'admin', 'status' => 'active']);
    }
}
