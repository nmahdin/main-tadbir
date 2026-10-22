<?php

namespace App\Core\Settings;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use App\Models\User;

/**
 * Effective settings resolution (Stage C7-2, implementing the
 * C7-1 EffectiveSettingResolver contract).
 *
 * Layers are walked in SettingLayer::precedence() order and a
 * layer participates ONLY where the definition permits it:
 *
 *  1. UserPreference    — definition declares userOverride.
 *  2. WorkspaceOverride — definition declares workspaceOverride
 *     AND the owning Organization's per-key policy allows it
 *     (definition default-DENY otherwise). A stored Workspace
 *     value whose override is currently denied is IGNORED here
 *     but never deleted; it becomes effective again if the policy
 *     re-allows it (values are revalidated on write, and the
 *     stored encoding is definition-typed by construction).
 *  3. OrganizationValue — definition allows the organization
 *     scope. The Organization is ALWAYS derived from the persisted
 *     Workspace row when a Workspace is in context; a
 *     caller-provided Organization never overrides that. Personal
 *     Workspaces (no owning Organization) skip this layer.
 *  4. PlatformDefault   — the definition's code default.
 *
 * A `mandatory` definition is a higher-level policy ceiling: the
 * User and Workspace layers are skipped entirely.
 *
 * Legacy compatibility (C6→C7): for the two public-metadata keys
 * carrying a `legacy_source`, the Organization layer reads the
 * canonical store first and falls back to the frozen legacy
 * `organizations.settings` JSON — identical to the Invitation
 * Presenter's read path, so approved writes and public
 * presentation can never diverge. An explicit canonical null is
 * a real value (intentionally cleared) and suppresses fallback.
 *
 * Resolution is read-only and uncached by design (correctness
 * over micro-optimization): Organization changes are visible in
 * the very next resolution after their transaction commits, and
 * nothing is ever materialized into Workspace rows.
 */
final class ScopedEffectiveSettingResolver implements EffectiveSettingResolver
{
    public function __construct(
        private readonly SettingsRegistry $registry,
        private readonly SettingValueStore $store,
    ) {}

    public function resolve(string $key, ?Organization $organization = null, ?Workspace $workspace = null, ?User $user = null): array
    {
        $definition = $this->registry->get($key);
        $effectiveOrganization = $this->effectiveOrganization($organization, $workspace);

        if (! $definition->mandatory && $definition->userOverride && $user !== null) {
            $stored = $this->store->get(SettingDefinition::SCOPE_USER, (int) $user->id, $key);
            if ($stored->exists) {
                return $this->result($stored->value, SettingLayer::UserPreference, $definition, 'user', (int) $user->id, false);
            }
        }

        if (! $definition->mandatory && $definition->workspaceOverride && $workspace !== null) {
            $allowed = $effectiveOrganization !== null
                ? $this->store->allowsWorkspaceOverride((int) $effectiveOrganization->id, $key)
                : $definition->workspaceOverrideDefault;

            if ($allowed) {
                $stored = $this->store->get(SettingDefinition::SCOPE_WORKSPACE, (int) $workspace->id, $key);
                if ($stored->exists) {
                    return $this->result($stored->value, SettingLayer::WorkspaceOverride, $definition, 'workspace', (int) $workspace->id, false);
                }
            }
        }

        if ($effectiveOrganization !== null && in_array(SettingDefinition::SCOPE_ORGANIZATION, $definition->allowedScopes, true)) {
            $stored = $this->store->get(SettingDefinition::SCOPE_ORGANIZATION, (int) $effectiveOrganization->id, $key);
            if ($stored->exists) {
                return $this->result($stored->value, SettingLayer::OrganizationValue, $definition, 'organization', (int) $effectiveOrganization->id, false);
            }

            $legacy = $this->legacyPublicValue($definition, $effectiveOrganization);
            if ($legacy !== null) {
                return $this->result($legacy, SettingLayer::OrganizationValue, $definition, 'organization', (int) $effectiveOrganization->id, true);
            }
        }

        return $this->result($definition->default, SettingLayer::PlatformDefault, $definition, null, null, false);
    }

    /**
     * The owning Organization comes from the persisted Workspace
     * whenever a Workspace is in context — a caller-provided
     * Organization NEVER overrides persisted ownership (and a
     * personal Workspace has no Organization layer at all).
     */
    private function effectiveOrganization(?Organization $organization, ?Workspace $workspace): ?Organization
    {
        if ($workspace !== null) {
            if ($workspace->organization_id === null) {
                return null;
            }

            return $workspace->organization()->first() ?? $organization;
        }

        return $organization;
    }

    /**
     * Backward-compatible read of the frozen legacy public
     * metadata (`organizations.settings.public.*`), only for
     * definitions that declare a legacy_source. Returns null when
     * no legacy value exists (absence stays absence).
     */
    private function legacyPublicValue(SettingDefinition $definition, Organization $organization): ?string
    {
        $legacySource = $definition->constraints['legacy_source'] ?? null;
        if (! is_string($legacySource) || ! str_starts_with($legacySource, 'organizations.settings.')) {
            return null;
        }

        $path = explode('.', substr($legacySource, strlen('organizations.settings.')));
        $value = $organization->settings;
        foreach ($path as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                return null;
            }
            $value = $value[$segment];
        }

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    /**
     * @return array{value: mixed, layer: SettingLayer, definition: SettingDefinition, has_explicit_value: bool, source: array{owner_type: string|null, owner_id: int|null, legacy: bool}}
     */
    private function result(mixed $value, SettingLayer $layer, SettingDefinition $definition, ?string $ownerType, ?int $ownerId, bool $legacy): array
    {
        return [
            'value' => $value,
            'layer' => $layer,
            'definition' => $definition,
            'has_explicit_value' => $layer !== SettingLayer::PlatformDefault,
            'source' => ['owner_type' => $ownerType, 'owner_id' => $ownerId, 'legacy' => $legacy],
        ];
    }
}
