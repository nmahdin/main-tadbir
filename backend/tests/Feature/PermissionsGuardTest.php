<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * محافظت‌های ماتریس دسترسی: جلوگیری از ارتقای دسترسی از مسیر نقش‌ها و کاربران.
 */
class PermissionsGuardTest extends TestCase
{
    use RefreshDatabase;

    /**
     * کاربری با نقش و دسترسی‌های مشخص می‌سازد و به‌عنوان او احراز هویت می‌کند.
     *
     * @param  array<int, string>  $permissions
     */
    private function actingAsUser(string $roleKey, array $permissions): User
    {
        $role = Role::query()->create([
            'key' => $roleKey,
            'name' => $roleKey,
            'description' => 'Test role',
            'color' => '#000000',
            'is_system' => false,
            'is_active' => true,
        ]);

        $permissionModels = collect($permissions)->map(fn (string $key) => Permission::query()->updateOrCreate(
            ['key' => $key],
            ['label' => $key, 'description' => $key, 'category' => 'tests'],
        ));

        $role->permissions()->sync($permissionModels->pluck('id'));

        $user = User::factory()->create([
            'username' => $roleKey.'.'.uniqid(),
            'role_id' => $role->id,
            'role_key' => $role->key,
        ]);

        Sanctum::actingAs($user);

        return $user;
    }

    public function test_role_editor_cannot_change_role_permissions(): void
    {
        $targetRole = Role::query()->create([
            'key' => 'custom_role',
            'name' => 'Custom',
            'description' => 'Custom role',
            'color' => '#123456',
            'is_system' => false,
            'is_active' => true,
        ]);

        // کاربر فقط roles.edit دارد؛ نباید بتواند مجوزهای نقش دیگری را تغییر دهد.
        $this->actingAsUser('role_editor', ['roles.view', 'roles.edit']);

        $this->putJson("/api/v1/roles/{$targetRole->id}", [
            'key' => 'custom_role',
            'name' => 'Custom',
            'permissions' => ['roles.manage_permissions'],
        ])->assertForbidden();

        // تغییر مشخصات ساده (بدون permissions) با roles.edit مجاز است.
        $this->putJson("/api/v1/roles/{$targetRole->id}", [
            'key' => 'custom_role',
            'name' => 'Custom Updated',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Custom Updated');
    }

    public function test_role_permission_manager_can_sync_permissions(): void
    {
        $targetRole = Role::query()->create([
            'key' => 'custom_role_2',
            'name' => 'Custom 2',
            'description' => 'Custom role',
            'color' => '#123456',
            'is_system' => false,
            'is_active' => true,
        ]);

        Permission::query()->create(['key' => 'projects.view', 'label' => 'x', 'description' => 'x', 'category' => 'projects']);
        $this->actingAsUser('perm_manager', ['roles.view', 'roles.edit', 'roles.manage_permissions']);

        $this->putJson("/api/v1/roles/{$targetRole->id}", [
            'key' => 'custom_role_2',
            'name' => 'Custom 2',
            'permissions' => ['projects.view'],
        ])->assertOk()
            ->assertJsonCount(1, 'data.permissions');
    }

    public function test_system_role_key_is_protected(): void
    {
        $systemRole = Role::query()->create([
            'key' => 'admin',
            'name' => 'Admin',
            'description' => 'System admin',
            'color' => '#000000',
            'is_system' => true,
            'is_active' => true,
        ]);

        $this->actingAsUser('perm_manager', ['roles.view', 'roles.edit', 'roles.manage_permissions']);

        $this->putJson("/api/v1/roles/{$systemRole->id}", [
            'key' => 'hijacked_admin',
            'name' => 'Admin',
        ])->assertForbidden();
    }

    public function test_user_status_change_requires_dedicated_permission(): void
    {
        $editor = $this->actingAsUser('user_editor', ['users.view', 'users.edit']);
        $target = User::factory()->create(['status' => 'active', 'username' => 'target.'.uniqid()]);

        // کاربر دارای users.edit ولی بدون users.status نمی‌تواند وضعیت را مسدود کند.
        $this->putJson("/api/v1/users/{$target->id}", [
            'name' => $target->name,
            'username' => $target->username,
            'email' => $target->email,
            'status' => 'blocked',
        ])->assertForbidden();

        // ویرایش مشخصات ساده با users.edit مجاز است.
        $this->putJson("/api/v1/users/{$target->id}", [
            'name' => 'نام به‌روزشده',
            'username' => $target->username,
            'email' => $target->email,
        ])->assertOk()
            ->assertJsonPath('data.name', 'نام به‌روزشده');

        // کاربر دارای users.status می‌تواند وضعیت را تغییر دهد.
        $this->actingAsUser('user_status_manager', ['users.view', 'users.status']);

        $this->putJson("/api/v1/users/{$target->id}", [
            'name' => $target->name,
            'username' => $target->username,
            'email' => $target->email,
            'status' => 'blocked',
        ])->assertOk()
            ->assertJsonPath('data.status', 'blocked');

        unset($editor);
    }

    public function test_user_cannot_change_own_role(): void
    {
        $user = $this->actingAsUser('self_editor', ['users.view', 'users.edit']);

        $this->putJson("/api/v1/users/{$user->id}", [
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'role' => 'admin',
        ])->assertForbidden();
    }
}
