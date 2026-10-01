<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RoleInternalKeyTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_custom_role_key_is_generated_server_side_and_create_rejects_client_key(): void
    {
        $role = Role::create(['key' => 'role_admin_test', 'name' => 'Role admin', 'is_active' => true]);
        foreach (['roles.view', 'roles.create'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $actor = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($actor);

        $generated = $this->postJson('/api/v1/roles', ['name' => 'نقش ویراستار فارسی', 'description' => 'توضیح'])
            ->assertCreated()->assertJsonPath('data.name', 'نقش ویراستار فارسی')->json('data.key');
        $this->assertMatchesRegularExpression('/^custom_[a-z0-9]{16}$/', $generated);

        $this->postJson('/api/v1/roles', ['key' => 'forged_key', 'name' => 'نقش دوم'])
            ->assertUnprocessable()->assertJsonValidationErrors('key');
    }
}
