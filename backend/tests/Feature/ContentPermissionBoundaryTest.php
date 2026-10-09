<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContentPermissionBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_force_delete_is_defaulted_only_to_the_real_admin_role(): void
    {
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        $force = Permission::where('key', 'content.force_delete')->firstOrFail();
        $admin = Role::where('key', 'admin')->firstOrFail();
        $this->assertTrue($admin->permissions()->whereKey($force->id)->exists());

        foreach (['content.create', 'content.edit', 'content.delete'] as $grant) {
            $role = Role::create([
                'key' => str_replace('.', '_', $grant),
                'name' => $grant,
                'is_active' => true,
            ]);
            $role->permissions()->attach(Permission::where('key', $grant)->firstOrFail());
            $this->assertFalse(
                $role->permissions()->whereKey($force->id)->exists(),
                $grant.' must never imply content.force_delete.',
            );
        }
    }
}
