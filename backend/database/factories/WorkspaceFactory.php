<?php

namespace Database\Factories;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Workspace>
 */
class WorkspaceFactory extends Factory
{
    protected $model = Workspace::class;

    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'owner_user_id' => User::factory(),
            'organization_id' => null,
            'is_default' => false,
            'status' => 'active',
        ];
    }

    public function personal(): static
    {
        return $this->state(fn (): array => [
            'owner_user_id' => User::factory(),
            'organization_id' => null,
        ]);
    }

    public function organizational(): static
    {
        return $this->state(fn (): array => [
            'owner_user_id' => null,
            'organization_id' => Organization::factory(),
        ]);
    }

    public function default(): static
    {
        return $this->state(fn (): array => ['is_default' => true]);
    }
}
