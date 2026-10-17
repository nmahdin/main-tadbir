<?php

namespace App\Core\Modules;

use InvalidArgumentException;

/**
 * In-memory registry of module manifests.
 *
 * Deliberately minimal (Stage 02): registration is explicit PHP code, there
 * is no discovery, no database backing and no lifecycle beyond registration.
 * Later stages register real modules from their own service wiring.
 */
final class ModuleRegistry
{
    /** @var array<string, ModuleManifest> */
    private array $modules = [];

    public function register(ModuleManifest $manifest): void
    {
        if (isset($this->modules[$manifest->id])) {
            throw new InvalidArgumentException("Module [{$manifest->id}] is already registered.");
        }

        $permissionOwners = [];
        foreach ($this->modules as $existing) {
            foreach ($existing->permissions as $permission) {
                $permissionOwners[$permission] = $existing->id;
            }
        }

        foreach ($manifest->permissions as $permission) {
            if (isset($permissionOwners[$permission])) {
                throw new InvalidArgumentException(
                    "Permission [{$permission}] is already owned by module [{$permissionOwners[$permission]}]."
                );
            }
        }

        $this->modules[$manifest->id] = $manifest;
    }

    public function has(string $id): bool
    {
        return isset($this->modules[$id]);
    }

    public function get(string $id): ModuleManifest
    {
        if (! isset($this->modules[$id])) {
            throw new InvalidArgumentException("Module [{$id}] is not registered.");
        }

        return $this->modules[$id];
    }

    /** @return array<string, ModuleManifest> */
    public function all(): array
    {
        return $this->modules;
    }

    /** @return array<int, string> All registered permission keys, sorted. */
    public function permissionKeys(): array
    {
        $keys = [];
        foreach ($this->modules as $manifest) {
            $keys = [...$keys, ...$manifest->permissions];
        }
        sort($keys);

        return $keys;
    }
}
