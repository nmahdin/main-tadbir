<?php

namespace Database\Factories;

use App\Core\Organizations\Organization;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ScopedRole>
 */
class ScopedRoleFactory extends Factory
{
    protected $model = ScopedRole::class;

    public function definition(): array
    {
        return [
            'scope' => PermissionCatalog::SCOPE_WORKSPACE,
            'workspace_id' => Workspace::factory(),
            'organization_id' => null,
            'key' => 'custom_'.fake()->unique()->word(),
            'name' => fake()->words(2, true),
            'is_protected' => false,
        ];
    }

    public function workspaceManager(): static
    {
        return $this->state(fn (): array => [
            'scope' => PermissionCatalog::SCOPE_WORKSPACE,
            'organization_id' => null,
            'key' => RoleProvisioner::WORKSPACE_MANAGER_KEY,
            'name' => 'Workspace Manager',
            'is_protected' => true,
        ]);
    }

    public function workspaceMember(): static
    {
        return $this->state(fn (): array => [
            'scope' => PermissionCatalog::SCOPE_WORKSPACE,
            'organization_id' => null,
            'key' => RoleProvisioner::WORKSPACE_MEMBER_KEY,
            'name' => 'Member',
            'is_protected' => true,
        ]);
    }

    public function organization(): static
    {
        return $this->state(fn (): array => [
            'scope' => PermissionCatalog::SCOPE_ORGANIZATION,
            'workspace_id' => null,
            'organization_id' => Organization::factory(),
            'key' => 'custom_'.fake()->unique()->word(),
        ]);
    }

    public function organizationManager(): static
    {
        return $this->organization()->state(fn (): array => [
            'key' => RoleProvisioner::ORGANIZATION_MANAGER_KEY,
            'name' => 'Organization Manager',
            'is_protected' => true,
        ]);
    }

    public function organizationMember(): static
    {
        return $this->organization()->state(fn (): array => [
            'key' => RoleProvisioner::ORGANIZATION_MEMBER_KEY,
            'name' => 'Organization Member',
            'is_protected' => true,
        ]);
    }
}
