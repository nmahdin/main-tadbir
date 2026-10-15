<?php

namespace Database\Factories;

use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\ScopedPermission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ScopedPermission>
 */
class ScopedPermissionFactory extends Factory
{
    protected $model = ScopedPermission::class;

    public function definition(): array
    {
        $key = fake()->unique()->randomElement(PermissionCatalog::keys());

        return [
            'key' => $key,
            'scope' => PermissionCatalog::scopeOf($key),
            'name' => $key,
        ];
    }
}
