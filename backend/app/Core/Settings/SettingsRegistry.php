<?php

namespace App\Core\Settings;

use App\Core\Modules\ModuleCatalog;

/**
 * Canonical code-defined settings registry (Stage C7-1).
 *
 * Definitions come from Core (`CoreSettingDefinitions`) and, for
 * module-owned settings, from the owning module registering under
 * its stable C4 catalog key. Registration is strict:
 *  - duplicate keys are rejected (a second registration of a key
 *    is always a conflict, never an overwrite);
 *  - every definition must be structurally valid (which includes
 *    its default value validating against its own type);
 *  - ownership must be `core` or a known catalog module key, and
 *    module registrations must match the definition's owner —
 *    settings registered by the wrong module are rejected.
 *
 * The registry has no side effects: it activates nothing, grants
 * nothing, and materializes no values.
 */
final class SettingsRegistry
{
    /** @var array<string, SettingDefinition> */
    private array $definitions = [];

    public static function withCoreDefinitions(): self
    {
        $registry = new self;
        foreach (CoreSettingDefinitions::all() as $definition) {
            $registry->register($definition);
        }

        return $registry;
    }

    /**
     * @throws SettingRegistryException
     */
    public function register(SettingDefinition $definition): void
    {
        $definition->assertStructurallyValid();

        if ($definition->owner !== SettingDefinition::OWNER_CORE
            && ! in_array($definition->owner, ModuleCatalog::keys(), true)) {
            throw new SettingRegistryException('setting_owner_unknown', "Setting [{$definition->key}] is owned by unknown module [{$definition->owner}].");
        }

        $this->add($definition);
    }

    /**
     * Module entry point: a module may register ONLY definitions
     * it owns, under its stable catalog key.
     *
     * @throws SettingRegistryException
     */
    public function registerForModule(string $moduleKey, SettingDefinition $definition): void
    {
        if (! in_array($moduleKey, ModuleCatalog::keys(), true)) {
            throw new SettingRegistryException('setting_owner_unknown', "Unknown module [{$moduleKey}] cannot register settings.");
        }

        if ($definition->owner !== $moduleKey) {
            throw new SettingRegistryException('setting_owner_mismatch', "Module [{$moduleKey}] cannot register setting [{$definition->key}] owned by [{$definition->owner}].");
        }

        $definition->assertStructurallyValid();
        $this->add($definition);
    }

    public function get(string $key): SettingDefinition
    {
        return $this->definitions[$key]
            ?? throw new SettingRegistryException('setting_not_found', "Setting [{$key}] is not registered.");
    }

    public function has(string $key): bool
    {
        return isset($this->definitions[$key]);
    }

    /**
     * @return list<SettingDefinition> Definitions in key order (deterministic).
     */
    public function all(): array
    {
        $definitions = $this->definitions;
        ksort($definitions);

        return array_values($definitions);
    }

    /**
     * @throws SettingRegistryException
     */
    private function add(SettingDefinition $definition): void
    {
        if (isset($this->definitions[$definition->key])) {
            throw new SettingRegistryException('setting_key_duplicate', "Setting key [{$definition->key}] is already registered; conflicting redefinition is refused.");
        }

        $this->definitions[$definition->key] = $definition;
    }
}
