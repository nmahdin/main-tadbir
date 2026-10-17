<?php

namespace App\Core\Settings;

use Illuminate\Support\Facades\DB;

/**
 * Idempotent synchronization of the code registry into
 * `core_setting_definitions` (Stage C7-1), mirroring the
 * ModuleRegistrySynchronizer contract:
 *
 *  - missing definitions are created;
 *  - identical definitions (same fingerprint) are skipped;
 *  - a changed definition is updated ONLY when the code declares
 *    a higher version (an explicit schema evolution);
 *  - anything else — a same/lower-version fingerprint mismatch,
 *    or a persisted key the code no longer registers — is
 *    unexpected registry drift and aborts the sync loudly inside
 *    its transaction. Nothing is silently overwritten.
 *
 * Synchronization touches ONLY the definitions table: it never
 * activates modules, grants RBAC, changes subscriptions or
 * memberships, or materializes default values for any owner.
 */
final class SettingsRegistrySynchronizer
{
    /**
     * @return array{created: int, updated: int, unchanged: int}
     *
     * @throws SettingRegistryException
     */
    public function sync(SettingsRegistry $registry): array
    {
        $definitions = $registry->all();

        return DB::transaction(function () use ($definitions, $registry): array {
            $persisted = CoreSettingDefinition::query()->get()->keyBy('key');

            $unexpected = array_diff($persisted->keys()->all(), array_map(fn (SettingDefinition $definition) => $definition->key, $definitions));
            if ($unexpected !== []) {
                throw new SettingRegistryException(
                    'setting_registry_drift',
                    'Persisted setting definitions are absent from the code registry: '.implode(', ', $unexpected).'.',
                );
            }

            $created = 0;
            $updated = 0;
            $unchanged = 0;

            foreach ($definitions as $definition) {
                /** @var CoreSettingDefinition|null $existing */
                $existing = $persisted->get($definition->key);

                if ($existing === null) {
                    CoreSettingDefinition::query()->create($this->attributes($definition));
                    $created++;

                    continue;
                }

                if ($existing->fingerprint === $definition->fingerprint()) {
                    // Presentation text may be refreshed without a
                    // schema event; semantics are fingerprint-covered.
                    if ($existing->title !== $definition->title || $existing->description !== $definition->description) {
                        $existing->forceFill([
                            'title' => $definition->title,
                            'description' => $definition->description,
                        ])->save();
                    }
                    $unchanged++;

                    continue;
                }

                if ($definition->version <= (int) $existing->version) {
                    throw new SettingRegistryException(
                        'setting_registry_drift',
                        "Persisted setting [{$definition->key}] conflicts with the code definition at version {$existing->version}; refusing to overwrite without a version bump.",
                    );
                }

                $existing->forceFill($this->attributes($definition))->save();
                $updated++;
            }

            return ['created' => $created, 'updated' => $updated, 'unchanged' => $unchanged];
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function attributes(SettingDefinition $definition): array
    {
        return [
            'key' => $definition->key,
            'title' => $definition->title,
            'description' => $definition->description,
            'type' => $definition->type,
            'default_value' => $definition->default,
            'allowed_scopes' => $definition->allowedScopes,
            'constraints' => $definition->constraints === [] ? null : $definition->constraints,
            'inheritance' => $definition->inheritance,
            'workspace_override' => $definition->workspaceOverride,
            'user_override' => $definition->userOverride,
            'workspace_override_default' => $definition->workspaceOverrideDefault,
            'mandatory' => $definition->mandatory,
            'nullable' => $definition->nullable,
            'owner' => $definition->owner,
            'sensitivity' => $definition->sensitivity,
            'version' => $definition->version,
            'fingerprint' => $definition->fingerprint(),
        ];
    }
}
