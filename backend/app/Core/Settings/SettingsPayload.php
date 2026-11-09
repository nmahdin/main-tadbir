<?php

namespace App\Core\Settings;

/**
 * Allowlisted HTTP presentation for scoped settings (Stage C7-4).
 *
 * Only safe, client-relevant fields cross this boundary: a
 * definition's presentation metadata and permitted enum values,
 * effective values with their winning source layer, explicit
 * stored state (presence + version for optimistic concurrency),
 * revision metadata, and secret CONFIGURED metadata. Secret
 * plaintext/ciphertext, internal legacy storage paths, and raw
 * constraint internals never appear here.
 */
final class SettingsPayload
{
    /**
     * @return array<string, mixed>
     */
    public static function definition(SettingDefinition $definition): array
    {
        return [
            'key' => $definition->key,
            'title' => $definition->title,
            'description' => $definition->description,
            'type' => $definition->type,
            'default' => $definition->default,
            'allowed_scopes' => $definition->allowedScopes,
            'inheritance' => $definition->inheritance,
            'workspace_override' => $definition->workspaceOverride,
            'user_override' => $definition->userOverride,
            'nullable' => $definition->nullable,
            'sensitivity' => $definition->sensitivity,
            'owner' => $definition->owner,
            'values' => isset($definition->constraints['values']) && is_array($definition->constraints['values'])
                ? array_values($definition->constraints['values'])
                : null,
        ];
    }

    /**
     * @param  array{value: mixed, layer: SettingLayer, has_explicit_value: bool, source: array{owner_type: string|null, owner_id: int|null, legacy: bool}}  $effective
     * @return array<string, mixed>
     */
    public static function effective(array $effective): array
    {
        return [
            'value' => $effective['value'],
            'source' => match ($effective['layer']) {
                SettingLayer::UserPreference => 'user',
                SettingLayer::WorkspaceOverride => 'workspace',
                SettingLayer::OrganizationValue => 'organization',
                SettingLayer::PlatformDefault => 'default',
            },
            'source_owner_type' => $effective['source']['owner_type'],
            'source_owner_id' => $effective['source']['owner_id'],
            'legacy' => $effective['source']['legacy'],
            'has_explicit_value' => $effective['has_explicit_value'],
        ];
    }

    /**
     * @return array{exists: bool, value: mixed, version: int|null}
     */
    public static function explicit(StoredSettingValue $stored): array
    {
        return [
            'exists' => $stored->exists,
            'value' => $stored->exists ? $stored->value : null,
            'version' => $stored->version,
        ];
    }

    /**
     * @param  array{id: int, operation: string, version: int, previous_present: bool, previous_value: mixed, new_present: bool, new_value: mixed, actor_user_id: int|null, created_at: string|null}  $revision
     * @return array<string, mixed>
     */
    public static function revision(array $revision): array
    {
        return [
            'id' => $revision['id'],
            'operation' => $revision['operation'],
            'version' => $revision['version'],
            'previous_present' => $revision['previous_present'],
            'previous_value' => $revision['previous_value'],
            'new_present' => $revision['new_present'],
            'new_value' => $revision['new_value'],
            'actor_user_id' => $revision['actor_user_id'],
            'created_at' => $revision['created_at'],
        ];
    }
}
