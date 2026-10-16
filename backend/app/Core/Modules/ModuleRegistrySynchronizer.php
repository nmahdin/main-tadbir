<?php

namespace App\Core\Modules;

use Illuminate\Support\Facades\DB;

/**
 * Idempotent synchronization of the canonical ModuleCatalog
 * into `core_modules`/`core_module_dependencies` (Stage C4-1).
 *
 * Fill-the-gaps only: missing module rows and dependency edges
 * are created; anything already persisted that disagrees with
 * the catalog — a renamed module, changed availability, an
 * unknown persisted module, or an unexpected edge — is a loud
 * conflict and aborts the sync inside its transaction. Nothing
 * here touches workspace activation rows, organization
 * policies, or RBAC: synchronization never enables a module for
 * any workspace and never grants a permission.
 */
final class ModuleRegistrySynchronizer
{
    /**
     * @return array{modules_created: int, edges_created: int}
     */
    public function sync(): array
    {
        $definitions = ModuleCatalog::definitions();
        // Validate the canonical graph before touching the database.
        new ModuleDependencyResolver($definitions);

        return DB::transaction(function () use ($definitions): array {
            $byKey = [];
            foreach (CoreModule::query()->get() as $module) {
                $byKey[$module->key] = $module;
            }

            $catalogKeys = array_map(fn (ModuleDefinition $d): string => $d->key, $definitions);
            $unexpected = array_diff(array_keys($byKey), $catalogKeys);
            if ($unexpected !== []) {
                throw new ModuleRegistryConflictException(
                    'Persisted modules are absent from the canonical catalog: '.implode(', ', $unexpected).'.',
                );
            }

            $modulesCreated = 0;
            foreach ($definitions as $definition) {
                $existing = $byKey[$definition->key] ?? null;
                if ($existing === null) {
                    $byKey[$definition->key] = CoreModule::create([
                        'key' => $definition->key,
                        'name' => $definition->name,
                        'availability' => $definition->availability->value,
                    ]);
                    $modulesCreated++;
                    continue;
                }

                if ($existing->name !== $definition->name
                    || $existing->availability !== $definition->availability) {
                    throw new ModuleRegistryConflictException(
                        "Persisted module [{$definition->key}] conflicts with the canonical definition; refusing to overwrite it.",
                    );
                }
            }

            $edgesCreated = $this->syncEdges($definitions, $byKey);

            return ['modules_created' => $modulesCreated, 'edges_created' => $edgesCreated];
        });
    }

    /**
     * @param  list<ModuleDefinition>  $definitions
     * @param  array<string, CoreModule>  $byKey
     */
    private function syncEdges(array $definitions, array $byKey): int
    {
        $expected = [];
        foreach ($definitions as $definition) {
            foreach ($definition->dependencies as $dependency) {
                $expected[$definition->key.'>'.$dependency] = [
                    (int) $byKey[$definition->key]->id,
                    (int) $byKey[$dependency]->id,
                ];
            }
        }

        $persisted = [];
        $rows = DB::table('core_module_dependencies')
            ->join('core_modules as m', 'm.id', '=', 'core_module_dependencies.module_id')
            ->join('core_modules as r', 'r.id', '=', 'core_module_dependencies.required_module_id')
            ->select('m.key as module_key', 'r.key as required_key')
            ->get();
        foreach ($rows as $row) {
            $persisted[$row->module_key.'>'.$row->required_key] = true;
        }

        $unexpectedEdges = array_diff(array_keys($persisted), array_keys($expected));
        if ($unexpectedEdges !== []) {
            throw new ModuleRegistryConflictException(
                'Persisted dependency edges are absent from the canonical catalog: '.implode(', ', $unexpectedEdges).'.',
            );
        }

        $created = 0;
        foreach ($expected as $pair => [$moduleId, $requiredId]) {
            if (! isset($persisted[$pair])) {
                DB::table('core_module_dependencies')->insert([
                    'module_id' => $moduleId,
                    'required_module_id' => $requiredId,
                ]);
                $created++;
            }
        }

        return $created;
    }
}
