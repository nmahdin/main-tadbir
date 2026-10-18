<?php

namespace App\Core\Settings\Services;

use App\Core\Audit\AuditWriter;
use App\Core\Identity\AccountStatus;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleCatalog;
use App\Core\Organizations\Organization;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Settings\CoreSettingSecret;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingValidationException;
use App\Core\Settings\SettingValueValidator;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Scoped secret administration + internal consumption (Stage C7-3).
 *
 * Secrets live ONLY in `core_setting_secrets` as Laravel
 * authenticated-encryption ciphertext (application key from the
 * environment; never stored in the database, never generated per
 * request). The generic settings store keeps rejecting secrets.
 *
 * Authorization is deliberately SEPARATE from ordinary settings:
 * `organization.settings.secrets.manage` /
 * `workspace.settings.secrets.manage`, which protected Manager
 * provisioning does NOT grant automatically (PermissionCatalog::
 * SEPARATELY_PROVISIONED_KEYS) — they are provisioned explicitly.
 * Platform/Legacy Admin status confers nothing; Organization
 * authority never implies Workspace secret access.
 *
 * Reads: administrators get METADATA ONLY (configured, version,
 * updated_at). Plaintext leaves this class exclusively through
 * consumeForOrganization/consumeForWorkspace — internal,
 * server-side integration execution contracts that re-check
 * lifecycle and module state at consumption time (a disabled
 * module's secret is NOT usable merely because a row exists).
 * Nothing returns plaintext, ciphertext, hashes, or key material
 * to any read API, DTO, audit, revision, exception, or log:
 * exception messages and audit summaries carry key/scope/version
 * only.
 */
final class ScopedSecretService
{
    public const ORGANIZATION_SECRETS = 'organization.settings.secrets.manage';

    public const WORKSPACE_SECRETS = 'workspace.settings.secrets.manage';

    /** Key-generation label recorded per row for future rotation. */
    private const CURRENT_KEY_VERSION = 'v1';

    public function __construct(
        private readonly SettingsRegistry $registry,
        private readonly MembershipPermissions $permissions,
        private readonly ModuleActivationPlanner $modulePlanner,
        private readonly AuditWriter $audit,
    ) {}

    // -- Organization secrets --------------------------------------

    /**
     * @return array{configured: bool, version: int|null, updated_at: string|null}
     */
    public function putOrganizationSecret(User $actor, Organization $organization, string $key, string $plaintext, ?int $expectedVersion = null): array
    {
        return DB::transaction(function () use ($actor, $organization, $key, $plaintext, $expectedVersion): array {
            $locked = Organization::query()->whereKey($organization->id)->lockForUpdate()->firstOrFail();
            $this->assertOperational($actor);
            $this->assertOrganizationOperational($locked);
            $this->assertOrganizationPermission($actor, $locked);
            $definition = $this->secretDefinition($key, SettingDefinition::SCOPE_ORGANIZATION);
            $this->assertModuleWritable($definition, null);

            return $this->storeSecret($actor, 'organization', (int) $locked->id, $definition, $plaintext, $expectedVersion, 'organization', (int) $locked->id);
        });
    }

    public function revokeOrganizationSecret(User $actor, Organization $organization, string $key, ?int $expectedVersion = null): void
    {
        DB::transaction(function () use ($actor, $organization, $key, $expectedVersion): void {
            $locked = Organization::query()->whereKey($organization->id)->lockForUpdate()->firstOrFail();
            $this->assertOperational($actor);
            $this->assertOrganizationOperational($locked);
            $this->assertOrganizationPermission($actor, $locked);
            $this->secretDefinition($key, SettingDefinition::SCOPE_ORGANIZATION);

            $this->revokeSecret($actor, 'organization', (int) $locked->id, $key, $expectedVersion, 'organization', (int) $locked->id);
        });
    }

    /**
     * @return array{configured: bool, version: int|null, updated_at: string|null}
     */
    public function organizationSecretMetadata(User $actor, Organization $organization, string $key): array
    {
        $this->assertOperational($actor);
        $this->assertOrganizationPermission($actor, $organization);
        $this->secretDefinition($key, SettingDefinition::SCOPE_ORGANIZATION);

        return $this->metadata('organization', (int) $organization->id, $key);
    }

    // -- Workspace secrets -----------------------------------------

    /**
     * @return array{configured: bool, version: int|null, updated_at: string|null}
     */
    public function putWorkspaceSecret(User $actor, Workspace $workspace, string $key, string $plaintext, ?int $expectedVersion = null): array
    {
        return DB::transaction(function () use ($actor, $workspace, $key, $plaintext, $expectedVersion): array {
            [$lockedWorkspace, $lockedOrganization] = $this->lockWorkspaceContext($workspace);
            $this->assertOperational($actor);
            if ($lockedOrganization !== null) {
                $this->assertOrganizationOperational($lockedOrganization);
            }
            $this->assertWorkspacePermission($actor, $lockedWorkspace);
            $definition = $this->secretDefinition($key, SettingDefinition::SCOPE_WORKSPACE);
            $this->assertModuleWritable($definition, $lockedWorkspace);

            return $this->storeSecret($actor, 'workspace', (int) $lockedWorkspace->id, $definition, $plaintext, $expectedVersion, 'workspace', (int) $lockedWorkspace->id);
        });
    }

    public function revokeWorkspaceSecret(User $actor, Workspace $workspace, string $key, ?int $expectedVersion = null): void
    {
        DB::transaction(function () use ($actor, $workspace, $key, $expectedVersion): void {
            [$lockedWorkspace, $lockedOrganization] = $this->lockWorkspaceContext($workspace);
            $this->assertOperational($actor);
            if ($lockedOrganization !== null) {
                $this->assertOrganizationOperational($lockedOrganization);
            }
            $this->assertWorkspacePermission($actor, $lockedWorkspace);
            $this->secretDefinition($key, SettingDefinition::SCOPE_WORKSPACE);

            $this->revokeSecret($actor, 'workspace', (int) $lockedWorkspace->id, $key, $expectedVersion, 'workspace', (int) $lockedWorkspace->id);
        });
    }

    /**
     * @return array{configured: bool, version: int|null, updated_at: string|null}
     */
    public function workspaceSecretMetadata(User $actor, Workspace $workspace, string $key): array
    {
        $this->assertOperational($actor);
        $this->assertWorkspacePermission($actor, $workspace);
        $this->secretDefinition($key, SettingDefinition::SCOPE_WORKSPACE);

        return $this->metadata('workspace', (int) $workspace->id, $key);
    }

    // -- Internal consumption (server-side execution only) ---------

    /**
     * Internal execution contract: returns the plaintext for a
     * server-side integration run, or null when not configured.
     * Re-checks Organization lifecycle at consumption time.
     *
     * @throws SettingServiceException when suspended/ended, the
     *                                owning module is unavailable, or decryption fails.
     */
    public function consumeForOrganization(Organization $organization, string $key): ?string
    {
        if (! $organization->isActive()) {
            throw new SettingServiceException('setting_organization_unavailable', 'The organization is not operational, so its secrets cannot be used.');
        }
        $this->secretDefinition($key, SettingDefinition::SCOPE_ORGANIZATION);

        return $this->decryptRow($this->row('organization', (int) $organization->id, $key), $key);
    }

    /**
     * Internal execution contract for Workspace-scoped secrets.
     * A secret whose owning module is not ENABLED on this
     * workspace is unusable — existence of a ciphertext row is
     * never sufficient.
     *
     * @throws SettingServiceException
     */
    public function consumeForWorkspace(Workspace $workspace, string $key): ?string
    {
        if ($workspace->organization_id !== null) {
            $organization = $workspace->organization()->first();
            if ($organization !== null && ! $organization->isActive()) {
                throw new SettingServiceException('setting_organization_unavailable', 'The organization is not operational, so its workspace secrets cannot be used.');
            }
        }

        $definition = $this->secretDefinition($key, SettingDefinition::SCOPE_WORKSPACE);
        $this->assertModuleWritable($definition, $workspace);

        return $this->decryptRow($this->row('workspace', (int) $workspace->id, $key), $key);
    }

    // -- Internals ---------------------------------------------------

    /**
     * @return array{configured: bool, version: int, updated_at: string|null}
     */
    private function storeSecret(User $actor, string $ownerType, int $ownerId, SettingDefinition $definition, string $plaintext, ?int $expectedVersion, string $auditScopeType, int $auditScopeId): array
    {
        $normalized = SettingValueValidator::validate($definition, $plaintext);
        if (! is_string($normalized) || $normalized === '') {
            throw new SettingValidationException('setting_secret_empty', 'A secret value must be a non-empty string.');
        }

        $existing = CoreSettingSecret::query()
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $definition->key)
            ->lockForUpdate()
            ->first();

        $currentVersion = $existing === null ? 0 : (int) $existing->version;
        if ($expectedVersion !== null && $expectedVersion !== $currentVersion) {
            throw new SettingServiceException('setting_version_conflict', "Secret [{$definition->key}] has changed; reload before writing.");
        }

        // Encryption happens only after every authorization and
        // validation gate has passed; failures carry no value.
        try {
            $ciphertext = Crypt::encryptString($normalized);
        } catch (\Throwable) {
            throw new SettingServiceException('setting_secret_encryption_unavailable', 'Secret encryption is not configured correctly; nothing was stored.');
        }

        if ($existing === null) {
            $row = CoreSettingSecret::query()->create([
                'setting_key' => $definition->key,
                'owner_type' => $ownerType,
                'owner_id' => $ownerId,
                'ciphertext' => $ciphertext,
                'key_version' => self::CURRENT_KEY_VERSION,
                'version' => 1,
                'created_by_user_id' => (int) $actor->id,
                'updated_by_user_id' => (int) $actor->id,
            ]);
        } else {
            $existing->forceFill([
                'ciphertext' => $ciphertext,
                'key_version' => self::CURRENT_KEY_VERSION,
                'version' => $currentVersion + 1,
                'updated_by_user_id' => (int) $actor->id,
            ])->save();
            $row = $existing;
        }

        $this->audit->record($actor, 'setting.secret_written', [
            'setting_key' => $definition->key,
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'version' => (int) $row->version,
        ], $auditScopeType, $auditScopeId, 'setting_secret', $ownerId);

        return $this->metadata($ownerType, $ownerId, $definition->key);
    }

    private function revokeSecret(User $actor, string $ownerType, int $ownerId, string $key, ?int $expectedVersion, string $auditScopeType, int $auditScopeId): void
    {
        $existing = CoreSettingSecret::query()
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $key)
            ->lockForUpdate()
            ->first();

        if ($existing === null) {
            return; // Revoking an unconfigured secret is a no-op.
        }

        if ($expectedVersion !== null && $expectedVersion !== (int) $existing->version) {
            throw new SettingServiceException('setting_version_conflict', "Secret [{$key}] has changed; reload before revoking.");
        }

        $version = (int) $existing->version;
        $existing->delete();

        $this->audit->record($actor, 'setting.secret_revoked', [
            'setting_key' => $key,
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'version' => $version,
        ], $auditScopeType, $auditScopeId, 'setting_secret', $ownerId);
    }

    /**
     * @return array{configured: bool, version: int|null, updated_at: string|null}
     */
    private function metadata(string $ownerType, int $ownerId, string $key): array
    {
        $row = $this->row($ownerType, $ownerId, $key);

        return [
            'configured' => $row !== null,
            'version' => $row === null ? null : (int) $row->version,
            'updated_at' => $row?->updated_at?->toIso8601String(),
        ];
    }

    private function row(string $ownerType, int $ownerId, string $key): ?CoreSettingSecret
    {
        return CoreSettingSecret::query()
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $key)
            ->first();
    }

    private function decryptRow(?CoreSettingSecret $row, string $key): ?string
    {
        if ($row === null) {
            return null;
        }

        try {
            return Crypt::decryptString((string) $row->ciphertext);
        } catch (DecryptException) {
            // Never include payload or key material in the failure.
            throw new SettingServiceException('setting_secret_undecryptable', "Secret [{$key}] cannot be decrypted with the configured application key.");
        }
    }

    private function secretDefinition(string $key, string $scope): SettingDefinition
    {
        $definition = $this->registry->get($key);

        if ($definition->sensitivity !== SettingDefinition::SENSITIVITY_SECRET) {
            throw new SettingValidationException('setting_not_secret', "Setting [{$key}] is not a secret setting.");
        }

        if (! in_array($scope, $definition->allowedScopes, true)) {
            throw new SettingValidationException('setting_scope_not_allowed', "Setting [{$key}] cannot be stored in scope [{$scope}].");
        }

        return $definition;
    }

    private function assertModuleWritable(SettingDefinition $definition, ?Workspace $workspace): void
    {
        if ($definition->owner === SettingDefinition::OWNER_CORE) {
            return;
        }

        $module = ModuleCatalog::get($definition->owner);
        if ($module === null || ! $module->isAvailable()) {
            throw new SettingServiceException('setting_module_unavailable', "Module [{$definition->owner}] is not available, so its secrets cannot be used.");
        }

        if ($workspace !== null && ! in_array($definition->owner, $this->modulePlanner->enabledModuleKeys($workspace), true)) {
            throw new SettingServiceException('setting_module_disabled', "Module [{$definition->owner}] is disabled for this workspace, so its secrets cannot be used.");
        }
    }

    /**
     * @return array{0: Workspace, 1: ?Organization}
     */
    private function lockWorkspaceContext(Workspace $workspace): array
    {
        $organization = $workspace->organization_id !== null
            ? Organization::query()->whereKey($workspace->organization_id)->lockForUpdate()->first()
            : null;

        $lockedWorkspace = Workspace::query()->whereKey($workspace->id)->lockForUpdate()->firstOrFail();

        return [$lockedWorkspace, $organization];
    }

    private function assertOperational(User $actor): void
    {
        if (! (AccountStatus::of($actor->status)?->allowsOperationalAccess() ?? false)) {
            throw new SettingServiceException('setting_forbidden', 'The actor is not an active account.');
        }
    }

    private function assertOrganizationOperational(Organization $organization): void
    {
        if (! $organization->isActive()) {
            throw new SettingServiceException('setting_organization_unavailable', 'The organization is not operational, so its secrets cannot be changed.');
        }
    }

    private function assertOrganizationPermission(User $actor, Organization $organization): void
    {
        if (! $this->permissions->userHasOrganizationPermission($actor, $organization, self::ORGANIZATION_SECRETS)) {
            throw new SettingServiceException('setting_forbidden', 'The actor lacks secret-administration authority in this organization.');
        }
    }

    private function assertWorkspacePermission(User $actor, Workspace $workspace): void
    {
        if (! $this->permissions->userHasWorkspacePermission($actor, $workspace, self::WORKSPACE_SECRETS)) {
            throw new SettingServiceException('setting_forbidden', 'The actor lacks secret-administration authority in this workspace.');
        }
    }
}
