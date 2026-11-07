<?php

namespace App\Core\Settings;

/**
 * One code-defined setting (Stage C7-1).
 *
 * Settings exist ONLY because code registers them here — there
 * are no arbitrary, UI-created keys. A definition states its
 * type, default, allowed owner scopes, inheritance and override
 * capabilities, owning Core component or business module (a
 * stable C4 module key), sensitivity, and a schema version. Its
 * fingerprint is a deterministic hash of every semantic field, so
 * persisted registry drift is detectable instead of silent.
 */
final readonly class SettingDefinition
{
    public const TYPE_STRING = 'string';

    public const TYPE_BOOLEAN = 'boolean';

    public const TYPE_INTEGER = 'integer';

    public const TYPE_ENUM = 'enum';

    public const TYPE_TIMEZONE = 'timezone';

    public const TYPE_LOCALE = 'locale';

    public const TYPE_JSON = 'json';

    public const TYPES = [
        self::TYPE_STRING, self::TYPE_BOOLEAN, self::TYPE_INTEGER,
        self::TYPE_ENUM, self::TYPE_TIMEZONE, self::TYPE_LOCALE, self::TYPE_JSON,
    ];

    public const SCOPE_ORGANIZATION = 'organization';

    public const SCOPE_WORKSPACE = 'workspace';

    public const SCOPE_USER = 'user';

    public const SCOPES = [self::SCOPE_ORGANIZATION, self::SCOPE_WORKSPACE, self::SCOPE_USER];

    public const INHERITANCE_NONE = 'none';

    public const INHERITANCE_ORGANIZATION_TO_WORKSPACE = 'organization_to_workspace';

    public const SENSITIVITY_PUBLIC = 'public';

    public const SENSITIVITY_INTERNAL = 'internal';

    public const SENSITIVITY_SECRET = 'secret';

    public const SENSITIVITIES = [self::SENSITIVITY_PUBLIC, self::SENSITIVITY_INTERNAL, self::SENSITIVITY_SECRET];

    public const OWNER_CORE = 'core';

    /**
     * @param  list<string>  $allowedScopes
     * @param  array<string, mixed>  $constraints  Type-specific validation
     *                                             constraints: max_length (string), min/max (integer),
     *                                             values (enum/locale), schema (json: map of key => scalar type).
     */
    public function __construct(
        public string $key,
        public string $title,
        public string $type,
        public mixed $default,
        public array $allowedScopes,
        public string $owner = self::OWNER_CORE,
        public ?string $description = null,
        public array $constraints = [],
        public string $inheritance = self::INHERITANCE_NONE,
        public bool $workspaceOverride = false,
        public bool $userOverride = false,
        public bool $workspaceOverrideDefault = false,
        public bool $mandatory = false,
        public bool $nullable = false,
        public string $sensitivity = self::SENSITIVITY_INTERNAL,
        public int $version = 1,
    ) {}

    /**
     * Deterministic fingerprint over every semantic field
     * (presentation text excluded: titles may be reworded without
     * a schema event).
     */
    public function fingerprint(): string
    {
        $scopes = $this->allowedScopes;
        sort($scopes);

        return hash('sha256', (string) json_encode([
            'key' => $this->key,
            'type' => $this->type,
            'default' => $this->default,
            'allowed_scopes' => $scopes,
            'constraints' => $this->sortedConstraints(),
            'inheritance' => $this->inheritance,
            'workspace_override' => $this->workspaceOverride,
            'user_override' => $this->userOverride,
            'workspace_override_default' => $this->workspaceOverrideDefault,
            'mandatory' => $this->mandatory,
            'nullable' => $this->nullable,
            'owner' => $this->owner,
            'sensitivity' => $this->sensitivity,
            'version' => $this->version,
        ], JSON_UNESCAPED_SLASHES));
    }

    /**
     * Structural validity of the definition itself (independent of
     * any value). Registry registration runs this, so an invalid
     * definition can never enter the registry or the database.
     *
     * @throws SettingRegistryException
     */
    public function assertStructurallyValid(): void
    {
        if (! preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/', $this->key)) {
            throw new SettingRegistryException('setting_key_invalid', "Setting key [{$this->key}] must be dotted lowercase segments.");
        }

        if (! in_array($this->type, self::TYPES, true)) {
            throw new SettingRegistryException('setting_type_unsupported', "Setting [{$this->key}] declares unsupported type [{$this->type}].");
        }

        if ($this->allowedScopes === [] || array_diff($this->allowedScopes, self::SCOPES) !== []) {
            throw new SettingRegistryException('setting_scope_unsupported', "Setting [{$this->key}] declares an unsupported owner scope.");
        }

        if (! in_array($this->inheritance, [self::INHERITANCE_NONE, self::INHERITANCE_ORGANIZATION_TO_WORKSPACE], true)) {
            throw new SettingRegistryException('setting_inheritance_unsupported', "Setting [{$this->key}] declares unsupported inheritance.");
        }

        if ($this->inheritance === self::INHERITANCE_ORGANIZATION_TO_WORKSPACE
            && ! (in_array(self::SCOPE_ORGANIZATION, $this->allowedScopes, true) && in_array(self::SCOPE_WORKSPACE, $this->allowedScopes, true))) {
            throw new SettingRegistryException('setting_inheritance_unsupported', "Setting [{$this->key}] inherits organization-to-workspace but does not allow both scopes.");
        }

        if (! in_array($this->sensitivity, self::SENSITIVITIES, true)) {
            throw new SettingRegistryException('setting_sensitivity_unsupported', "Setting [{$this->key}] declares unsupported sensitivity.");
        }

        if ($this->version < 1) {
            throw new SettingRegistryException('setting_version_invalid', "Setting [{$this->key}] must declare version >= 1.");
        }

        if ($this->type === self::TYPE_ENUM && ($this->constraints['values'] ?? []) === []) {
            throw new SettingRegistryException('setting_constraints_invalid', "Enum setting [{$this->key}] must declare its allowed values.");
        }

        if ($this->type === self::TYPE_JSON && ($this->constraints['schema'] ?? []) === []) {
            throw new SettingRegistryException('setting_constraints_invalid', "JSON setting [{$this->key}] must declare an explicit schema; free-form JSON is not supported.");
        }

        // Secrets are defined for C7-3's dedicated storage; they may
        // be registered (metadata only) but the generic value store
        // refuses them (enforced in SettingValueStore).
        if ($this->default !== null) {
            try {
                SettingValueValidator::validate($this, $this->default);
            } catch (SettingValidationException $exception) {
                throw new SettingRegistryException('setting_default_invalid', "Setting [{$this->key}] has an invalid default: {$exception->getMessage()}");
            }
        } elseif (! $this->nullable && $this->default === null) {
            // A null default on a non-nullable definition is a
            // contradiction; require explicit nullable intent.
            throw new SettingRegistryException('setting_default_invalid', "Setting [{$this->key}] has a null default but is not declared nullable.");
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function sortedConstraints(): array
    {
        $constraints = $this->constraints;
        ksort($constraints);
        if (isset($constraints['values']) && is_array($constraints['values'])) {
            $values = $constraints['values'];
            sort($values);
            $constraints['values'] = $values;
        }
        if (isset($constraints['schema']) && is_array($constraints['schema'])) {
            $schema = $constraints['schema'];
            ksort($schema);
            $constraints['schema'] = $schema;
        }

        return $constraints;
    }
}
