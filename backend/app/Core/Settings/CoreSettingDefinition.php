<?php

namespace App\Core\Settings;

use Illuminate\Database\Eloquent\Model;

/**
 * Persisted mirror of a code-defined SettingDefinition
 * (Stage C7-1). Written ONLY by SettingsRegistrySynchronizer;
 * runtime code reads definitions from the code registry (or this
 * mirror for store validation) — never the other way around.
 *
 */
final class CoreSettingDefinition extends Model
{
    protected $table = 'core_setting_definitions';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'default_value' => 'json',
            'allowed_scopes' => 'json',
            'constraints' => 'json',
            'workspace_override' => 'boolean',
            'user_override' => 'boolean',
            'workspace_override_default' => 'boolean',
            'mandatory' => 'boolean',
            'nullable' => 'boolean',
            'version' => 'integer',
        ];
    }

    public function toDefinition(): SettingDefinition
    {
        return new SettingDefinition(
            key: $this->key,
            title: $this->title,
            type: $this->type,
            default: $this->default_value,
            allowedScopes: $this->allowed_scopes ?? [],
            owner: $this->owner,
            description: $this->description,
            constraints: $this->constraints ?? [],
            inheritance: $this->inheritance,
            workspaceOverride: (bool) $this->workspace_override,
            userOverride: (bool) $this->user_override,
            workspaceOverrideDefault: (bool) $this->workspace_override_default,
            mandatory: (bool) $this->mandatory,
            nullable: (bool) $this->nullable,
            sensitivity: $this->sensitivity,
            version: (int) $this->version,
        );
    }
}
