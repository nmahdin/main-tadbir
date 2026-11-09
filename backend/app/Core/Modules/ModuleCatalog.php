<?php

namespace App\Core\Modules;

/**
 * The canonical, code-defined business module registry
 * (Stage C4-1).
 *
 * Contents follow the approved product catalog v1.3 exactly:
 * the 16 reusable modules and 6 specialized domain modules.
 * Features (planning, personal finance, ideas) and compositions
 * (reporting, media operations) are not modules and are absent.
 *
 * Technical availability reflects installed implementation
 * reality only: `projects` is implemented (Stage 04B pilot);
 * every other entry is a planned module with no implementation
 * and is therefore Unavailable — it may be inventoried, never
 * advertised as operationally activatable. Dependencies are the
 * composition prerequisites declared by the catalog (a module
 * built "over" others requires them).
 *
 * Core identity, security, RBAC, audit, and Files
 * infrastructure are not business modules and never appear here:
 * they cannot be disabled.
 */
final class ModuleCatalog
{
    /** Bump on any reviewed change to the definitions below. */
    public const VERSION = 1;

    /** @return list<ModuleDefinition> Definitions sorted by key (deterministic). */
    public static function definitions(): array
    {
        $unavailable = ModuleAvailability::Unavailable;

        $definitions = [
            new ModuleDefinition('calendar', 'Calendar', $unavailable),
            new ModuleDefinition('campaigns', 'Campaigns', $unavailable, ['content', 'crm', 'dam', 'finance', 'tasks']),
            new ModuleDefinition('challenges', 'Challenges', $unavailable, ['forms', 'goals', 'habits', 'tasks']),
            new ModuleDefinition('chat', 'Chat & Comments', $unavailable),
            new ModuleDefinition('competitions', 'Competitions', $unavailable, ['dam', 'finance', 'forms']),
            new ModuleDefinition('content', 'Content', $unavailable),
            new ModuleDefinition('crm', 'CRM', $unavailable),
            new ModuleDefinition('dam', 'DAM / Media Library', $unavailable),
            new ModuleDefinition('events', 'Events', $unavailable, ['calendar', 'content', 'crm', 'dam', 'finance', 'forms', 'tasks', 'workflows']),
            new ModuleDefinition('finance', 'Finance', $unavailable),
            new ModuleDefinition('forms', 'Forms & Responses', $unavailable),
            new ModuleDefinition('goals', 'Goals', $unavailable),
            new ModuleDefinition('habits', 'Habits & Routines', $unavailable),
            new ModuleDefinition('hrm', 'HRM', $unavailable, ['workflows']),
            new ModuleDefinition('meetings', 'Meetings', $unavailable),
            new ModuleDefinition('notes', 'Notes', $unavailable),
            new ModuleDefinition('operational-records', 'Operational Records', $unavailable),
            new ModuleDefinition('procurement', 'Procurement', $unavailable, ['crm', 'finance', 'workflows']),
            new ModuleDefinition('projects', 'Projects', ModuleAvailability::Available),
            new ModuleDefinition('surveys', 'Surveys', $unavailable, ['forms']),
            new ModuleDefinition('tasks', 'Tasks', $unavailable),
            new ModuleDefinition('workflows', 'Workflows', $unavailable),
        ];

        usort($definitions, fn (ModuleDefinition $a, ModuleDefinition $b): int => $a->key <=> $b->key);

        return $definitions;
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_map(fn (ModuleDefinition $definition): string => $definition->key, self::definitions());
    }

    public static function get(string $key): ?ModuleDefinition
    {
        foreach (self::definitions() as $definition) {
            if ($definition->key === $key) {
                return $definition;
            }
        }

        return null;
    }

    /**
     * Deterministic fingerprint of the canonical registry:
     * stable across processes and runs for a given VERSION, and
     * changed by any reviewed definition change.
     */
    public static function fingerprint(): string
    {
        $canonical = array_map(fn (ModuleDefinition $definition): array => [
            'key' => $definition->key,
            'name' => $definition->name,
            'availability' => $definition->availability->value,
            'dependencies' => [...$definition->dependencies],
        ], self::definitions());

        return hash('sha256', json_encode(['version' => self::VERSION, 'modules' => $canonical], JSON_THROW_ON_ERROR));
    }
}
