<?php

namespace App\Core\Settings;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Persistence primitive for explicit setting overrides and
 * Organization override policies (Stage C7-1).
 *
 * This store enforces the durable invariants — registered keys
 * only, definition-declared owner scopes, existing owners, strict
 * type validation, NO secret-sensitivity values in generic
 * storage, unique per-owner rows, monotonic per-setting versions
 * — but performs NO authorization and writes NO audit. Scoped
 * authorization, lifecycle checks, and transactional audit are
 * the C7-2 change service's job; HTTP layers must never call this
 * store directly.
 *
 * Definitions are read from the persisted registry mirror
 * (core_setting_definitions), so only synchronized keys exist.
 */
final class SettingValueStore
{
    /**
     * @throws SettingRegistryException|SettingValidationException
     */
    public function put(string $ownerType, int $ownerId, string $key, mixed $value, ?int $actorUserId = null): StoredSettingValue
    {
        $definition = $this->definition($key);
        $this->assertScopeAllowed($definition, $ownerType);
        $this->assertNotSecret($definition);
        $this->assertOwnerExists($ownerType, $ownerId);
        $normalized = SettingValueValidator::validate($definition, $value);

        return DB::transaction(function () use ($ownerType, $ownerId, $key, $normalized, $actorUserId): StoredSettingValue {
            $existing = CoreSettingValue::query()
                ->where('owner_type', $ownerType)
                ->where('owner_id', $ownerId)
                ->where('setting_key', $key)
                ->lockForUpdate()
                ->first();

            $encoded = (string) json_encode($normalized, JSON_UNESCAPED_SLASHES);

            if ($existing === null) {
                CoreSettingValue::query()->create([
                    'setting_key' => $key,
                    'owner_type' => $ownerType,
                    'owner_id' => $ownerId,
                    'value_json' => $encoded,
                    'version' => 1,
                    'updated_by_user_id' => $actorUserId,
                ]);

                return new StoredSettingValue(true, $normalized, 1);
            }

            $existing->forceFill([
                'value_json' => $encoded,
                'version' => (int) $existing->version + 1,
                'updated_by_user_id' => $actorUserId,
            ])->save();

            return new StoredSettingValue(true, $normalized, (int) $existing->version);
        });
    }

    public function get(string $ownerType, int $ownerId, string $key): StoredSettingValue
    {
        $row = CoreSettingValue::query()
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $key)
            ->first();

        if ($row === null) {
            return StoredSettingValue::absent();
        }

        return new StoredSettingValue(true, $row->decodedValue(), (int) $row->version);
    }

    public function forget(string $ownerType, int $ownerId, string $key): void
    {
        CoreSettingValue::query()
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $key)
            ->delete();
    }

    /**
     * Persist an Organization's per-key Workspace-override policy
     * (Stage C7-1, versioned in C7-2). Only keys whose definition
     * declares Workspace-override support may carry a policy.
     * Versions are monotonic: creation is version 1, every update
     * increments. Returns the resulting policy decision.
     *
     * @return array{allow: bool, version: int, explicit: bool}
     *
     * @throws SettingRegistryException|SettingValidationException
     */
    public function putOverridePolicy(int $organizationId, string $key, bool $allowWorkspaceOverride, ?int $actorUserId = null, ?int $expectedVersion = null): array
    {
        $definition = $this->definition($key);

        if (! $definition->workspaceOverride) {
            throw new SettingValidationException('setting_override_not_supported', "Setting [{$key}] does not declare Workspace-override support.");
        }

        if (! Organization::query()->whereKey($organizationId)->exists()) {
            throw new SettingValidationException('setting_owner_not_found', "Organization [{$organizationId}] does not exist.");
        }

        return DB::transaction(function () use ($organizationId, $key, $allowWorkspaceOverride, $actorUserId, $expectedVersion): array {
            $existing = CoreSettingOverridePolicy::query()
                ->where('organization_id', $organizationId)
                ->where('setting_key', $key)
                ->lockForUpdate()
                ->first();

            // Optimistic check UNDER the row lock: an absent policy
            // is version 0; a stale expectation aborts the write.
            $currentVersion = $existing === null ? 0 : (int) $existing->version;
            if ($expectedVersion !== null && $expectedVersion !== $currentVersion) {
                throw new SettingServiceException('setting_version_conflict', "The override policy for [{$key}] has changed; reload before writing.");
            }

            if ($existing === null) {
                CoreSettingOverridePolicy::query()->create([
                    'organization_id' => $organizationId,
                    'setting_key' => $key,
                    'allow_workspace_override' => $allowWorkspaceOverride,
                    'updated_by_user_id' => $actorUserId,
                    'version' => 1,
                ]);

                return ['allow' => $allowWorkspaceOverride, 'version' => 1, 'explicit' => true];
            }

            $existing->forceFill([
                'allow_workspace_override' => $allowWorkspaceOverride,
                'updated_by_user_id' => $actorUserId,
                'version' => (int) $existing->version + 1,
            ])->save();

            return ['allow' => $allowWorkspaceOverride, 'version' => (int) $existing->version, 'explicit' => true];
        });
    }

    /**
     * The full policy decision: an explicit policy row wins; a
     * missing row reports the definition's declared default
     * (default-DENY unless deliberately declared otherwise) with
     * explicit=false and version=null.
     *
     * @return array{allow: bool, version: int|null, explicit: bool}
     *
     * @throws SettingRegistryException
     */
    public function policyDecision(int $organizationId, string $key): array
    {
        $definition = $this->definition($key);

        $policy = CoreSettingOverridePolicy::query()
            ->where('organization_id', $organizationId)
            ->where('setting_key', $key)
            ->first();

        if ($policy === null) {
            return ['allow' => $definition->workspaceOverrideDefault, 'version' => null, 'explicit' => false];
        }

        return ['allow' => (bool) $policy->allow_workspace_override, 'version' => (int) $policy->version, 'explicit' => true];
    }

    /**
     * Effective override permission (see policyDecision()).
     *
     * @throws SettingRegistryException
     */
    public function allowsWorkspaceOverride(int $organizationId, string $key): bool
    {
        return $this->policyDecision($organizationId, $key)['allow'];
    }

    /**
     * @throws SettingRegistryException
     */
    private function definition(string $key): SettingDefinition
    {
        $model = CoreSettingDefinition::query()->where('key', $key)->first();

        if ($model === null) {
            throw new SettingRegistryException('setting_not_found', "Setting [{$key}] is not registered (synchronize the registry first).");
        }

        return $model->toDefinition();
    }

    /**
     * @throws SettingValidationException
     */
    private function assertScopeAllowed(SettingDefinition $definition, string $ownerType): void
    {
        if (! in_array($ownerType, $definition->allowedScopes, true)) {
            throw new SettingValidationException('setting_scope_not_allowed', "Setting [{$definition->key}] cannot be owned by scope [{$ownerType}].");
        }
    }

    /**
     * Secrets never enter generic storage (C7-3 owns secret
     * storage); this is a hard boundary, not a policy option.
     *
     * @throws SettingValidationException
     */
    private function assertNotSecret(SettingDefinition $definition): void
    {
        if ($definition->sensitivity === SettingDefinition::SENSITIVITY_SECRET) {
            throw new SettingValidationException('setting_secret_not_storable', "Setting [{$definition->key}] is secret and can never be stored in generic setting values.");
        }
    }

    /**
     * owner_id is polymorphic (no DB FK by design); existence is
     * enforced here against the real owner tables.
     *
     * @throws SettingValidationException
     */
    private function assertOwnerExists(string $ownerType, int $ownerId): void
    {
        $exists = match ($ownerType) {
            SettingDefinition::SCOPE_ORGANIZATION => Organization::query()->whereKey($ownerId)->exists(),
            SettingDefinition::SCOPE_WORKSPACE => Workspace::query()->whereKey($ownerId)->exists(),
            SettingDefinition::SCOPE_USER => User::query()->whereKey($ownerId)->exists(),
            default => false,
        };

        if (! $exists) {
            throw new SettingValidationException('setting_owner_not_found', "Setting owner [{$ownerType}:{$ownerId}] does not exist.");
        }
    }
}
