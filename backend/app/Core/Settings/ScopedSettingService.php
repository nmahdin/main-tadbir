<?php

namespace App\Core\Settings;

use App\Core\Audit\AuditWriter;
use App\Core\Identity\AccountStatus;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleCatalog;
use App\Core\Organizations\Organization;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Settings\Services\SettingRevisionRecorder;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Authorized scoped-settings mutations and reads (Stage C7-2).
 *
 * Every mutation: (1) requires an operational (active) actor;
 * (2) locks the scope-container row first (organization row, then
 * workspace row — the C3/C6-1 lock order), then the setting row
 * inside SettingValueStore; (3) rechecks the Organization
 * lifecycle under that lock (suspended/ended deny everything,
 * including Workspace writes under them); (4) authorizes from
 * PERSISTED memberships (`organization.settings.manage`,
 * `workspace.settings.manage`, `*.settings.view` for reads) —
 * Platform/Legacy Admin status confers nothing, and Organization
 * authority never implies Workspace authority; (5) validates the
 * definition (registered, scope-eligible, not secret, module
 * state) and the value through the C7-1 validator; (6) checks the
 * expected version where provided (absent row = version 0;
 * policies likewise); (7) writes and audits in the SAME
 * transaction — an audit failure rolls the mutation back.
 *
 * Audit summaries carry actor/scope/key/operation/version only —
 * never setting VALUES (public or otherwise), so nothing sensitive
 * can leak through audit history.
 *
 * Neither Platform administrators nor arbitrary caller-chosen IDs
 * exist in these signatures: user preferences are always the
 * actor's own; scope owners arrive as persisted models.
 */
final class ScopedSettingService
{
    public const ORGANIZATION_VIEW = 'organization.settings.view';

    public const ORGANIZATION_MANAGE = 'organization.settings.manage';

    public const WORKSPACE_VIEW = 'workspace.settings.view';

    public const WORKSPACE_MANAGE = 'workspace.settings.manage';

    public function __construct(
        private readonly SettingsRegistry $registry,
        private readonly SettingValueStore $store,
        private readonly EffectiveSettingResolver $resolver,
        private readonly MembershipPermissions $permissions,
        private readonly ModuleActivationPlanner $modulePlanner,
        private readonly AuditWriter $audit,
        private readonly SettingRevisionRecorder $revisions,
    ) {}

    // -- Reads -----------------------------------------------------

    /**
     * Effective value for the actor in a scope context. Workspace
     * context requires workspace.settings.view; Organization
     * context requires organization.settings.view; user-only keys
     * resolve against the actor. The actor's own user-preference
     * layer participates whenever the definition permits it.
     *
     * @return array{value: mixed, layer: SettingLayer, definition: SettingDefinition, has_explicit_value: bool, source: array{owner_type: string|null, owner_id: int|null, legacy: bool}}
     */
    public function effectiveFor(User $actor, string $key, ?Organization $organization = null, ?Workspace $workspace = null): array
    {
        $this->assertOperational($actor);
        $definition = $this->registry->get($key);

        if ($workspace !== null) {
            $this->assertWorkspacePermission($actor, $workspace, self::WORKSPACE_VIEW);
        } elseif ($organization !== null) {
            $this->assertOrganizationPermission($actor, $organization, self::ORGANIZATION_VIEW);
        } elseif (! $definition->userOverride) {
            throw new SettingServiceException('setting_forbidden', 'This setting requires a scope context to read.');
        }

        return $this->resolver->resolve($key, $organization, $workspace, $actor);
    }

    /**
     * The actor's own preference value (self only by construction).
     *
     * @return array{value: mixed, layer: SettingLayer, definition: SettingDefinition, has_explicit_value: bool, source: array{owner_type: string|null, owner_id: int|null, legacy: bool}}
     */
    public function preferenceFor(User $actor, string $key): array
    {
        $this->assertOperational($actor);

        return $this->resolver->resolve($key, user: $actor);
    }

    /**
     * @return array{allow: bool, version: int|null, explicit: bool}
     */
    public function overridePolicyFor(User $actor, Organization $organization, string $key): array
    {
        $this->assertOperational($actor);
        $this->registry->get($key);
        $this->assertOrganizationPermission($actor, $organization, self::ORGANIZATION_VIEW);

        return $this->store->policyDecision((int) $organization->id, $key);
    }

    // -- Organization values ---------------------------------------

    public function writeOrganizationValue(User $actor, Organization $organization, string $key, mixed $value, ?int $expectedVersion = null): StoredSettingValue
    {
        return DB::transaction(function () use ($actor, $organization, $key, $value, $expectedVersion): StoredSettingValue {
            $locked = $this->lockOrganization($organization);
            $this->assertOperational($actor);
            $this->assertOrganizationOperational($locked);
            $this->assertOrganizationPermission($actor, $locked, self::ORGANIZATION_MANAGE);
            $definition = $this->definitionForWrite($key, SettingDefinition::SCOPE_ORGANIZATION, null);
            $previous = $this->store->get('organization', (int) $locked->id, $key);
            $this->assertExpectedVersion($previous, $expectedVersion, $key);

            $stored = $this->store->put('organization', (int) $locked->id, $key, $value, (int) $actor->id);
            $audit = $this->audit->record($actor, 'setting.value_written', [
                'setting_key' => $key,
                'owner_type' => 'organization',
                'owner_id' => (int) $locked->id,
                'version' => $stored->version,
            ], 'organization', (int) $locked->id, 'setting_value', (int) $locked->id);
            $this->recordValueRevision('organization', (int) $locked->id, $key, $previous->exists ? CoreSettingRevision::OPERATION_UPDATE : CoreSettingRevision::OPERATION_CREATE, $previous, $stored, (int) $actor->id, (int) $audit->id);

            return $stored;
        });
    }

    public function removeOrganizationValue(User $actor, Organization $organization, string $key, ?int $expectedVersion = null): void
    {
        DB::transaction(function () use ($actor, $organization, $key, $expectedVersion): void {
            $locked = $this->lockOrganization($organization);
            $this->assertOperational($actor);
            $this->assertOrganizationOperational($locked);
            $this->assertOrganizationPermission($actor, $locked, self::ORGANIZATION_MANAGE);
            $this->definitionForWrite($key, SettingDefinition::SCOPE_ORGANIZATION, null);
            $current = $this->store->get('organization', (int) $locked->id, $key);
            $this->assertExpectedVersion($current, $expectedVersion, $key);

            $this->store->forget('organization', (int) $locked->id, $key);
            $audit = $this->audit->record($actor, 'setting.value_removed', [
                'setting_key' => $key,
                'owner_type' => 'organization',
                'owner_id' => (int) $locked->id,
                'version' => $current->version,
            ], 'organization', (int) $locked->id, 'setting_value', (int) $locked->id);
            $this->recordValueRevision('organization', (int) $locked->id, $key, CoreSettingRevision::OPERATION_REMOVE, $current, StoredSettingValue::absent(), (int) $actor->id, (int) $audit->id);
        });
    }

    // -- Workspace values ------------------------------------------

    public function writeWorkspaceValue(User $actor, Workspace $workspace, string $key, mixed $value, ?int $expectedVersion = null): StoredSettingValue
    {
        return DB::transaction(function () use ($actor, $workspace, $key, $value, $expectedVersion): StoredSettingValue {
            [$lockedWorkspace, $lockedOrganization] = $this->lockWorkspaceContext($workspace);
            $this->assertOperational($actor);
            if ($lockedOrganization !== null) {
                $this->assertOrganizationOperational($lockedOrganization);
            }
            $this->assertWorkspacePermission($actor, $lockedWorkspace, self::WORKSPACE_MANAGE);
            $definition = $this->definitionForWrite($key, SettingDefinition::SCOPE_WORKSPACE, $lockedWorkspace);

            // A Workspace write is an override: the key must support
            // overrides and the owning Organization's per-key policy
            // must currently allow them (default-deny). Values stored
            // earlier are retained when policy later denies — they
            // are ignored at resolution, never deleted.
            if (! $definition->workspaceOverride) {
                throw new SettingValidationException('setting_override_not_supported', "Setting [{$key}] does not support Workspace overrides.");
            }
            $allowed = $lockedOrganization !== null
                ? $this->store->allowsWorkspaceOverride((int) $lockedOrganization->id, $key)
                : $definition->workspaceOverrideDefault;
            if (! $allowed) {
                throw new SettingServiceException('setting_override_denied', 'The organization does not allow Workspace overrides for this setting.');
            }

            $previous = $this->store->get('workspace', (int) $lockedWorkspace->id, $key);
            $this->assertExpectedVersion($previous, $expectedVersion, $key);

            $stored = $this->store->put('workspace', (int) $lockedWorkspace->id, $key, $value, (int) $actor->id);
            $audit = $this->audit->record($actor, 'setting.value_written', [
                'setting_key' => $key,
                'owner_type' => 'workspace',
                'owner_id' => (int) $lockedWorkspace->id,
                'version' => $stored->version,
            ], 'workspace', (int) $lockedWorkspace->id, 'setting_value', (int) $lockedWorkspace->id);
            $this->recordValueRevision('workspace', (int) $lockedWorkspace->id, $key, $previous->exists ? CoreSettingRevision::OPERATION_UPDATE : CoreSettingRevision::OPERATION_CREATE, $previous, $stored, (int) $actor->id, (int) $audit->id);

            return $stored;
        });
    }

    public function removeWorkspaceValue(User $actor, Workspace $workspace, string $key, ?int $expectedVersion = null): void
    {
        DB::transaction(function () use ($actor, $workspace, $key, $expectedVersion): void {
            [$lockedWorkspace, $lockedOrganization] = $this->lockWorkspaceContext($workspace);
            $this->assertOperational($actor);
            if ($lockedOrganization !== null) {
                $this->assertOrganizationOperational($lockedOrganization);
            }
            $this->assertWorkspacePermission($actor, $lockedWorkspace, self::WORKSPACE_MANAGE);
            $this->definitionForWrite($key, SettingDefinition::SCOPE_WORKSPACE, $lockedWorkspace);
            $current = $this->store->get('workspace', (int) $lockedWorkspace->id, $key);
            $this->assertExpectedVersion($current, $expectedVersion, $key);

            $this->store->forget('workspace', (int) $lockedWorkspace->id, $key);
            $audit = $this->audit->record($actor, 'setting.value_removed', [
                'setting_key' => $key,
                'owner_type' => 'workspace',
                'owner_id' => (int) $lockedWorkspace->id,
                'version' => $current->version,
            ], 'workspace', (int) $lockedWorkspace->id, 'setting_value', (int) $lockedWorkspace->id);
            $this->recordValueRevision('workspace', (int) $lockedWorkspace->id, $key, CoreSettingRevision::OPERATION_REMOVE, $current, StoredSettingValue::absent(), (int) $actor->id, (int) $audit->id);
        });
    }

    // -- User preferences (actor's own, by construction) -----------

    public function writeUserPreference(User $actor, string $key, mixed $value, ?int $expectedVersion = null): StoredSettingValue
    {
        return DB::transaction(function () use ($actor, $key, $value, $expectedVersion): StoredSettingValue {
            $locked = User::query()->whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $this->assertOperational($locked);
            $definition = $this->registry->get($key);

            if (! $definition->userOverride || ! in_array(SettingDefinition::SCOPE_USER, $definition->allowedScopes, true)) {
                throw new SettingValidationException('setting_scope_not_allowed', "Setting [{$key}] is not a user preference.");
            }
            $this->assertNotSecret($definition);
            $this->assertModuleWritable($definition, null);
            $previous = $this->store->get('user', (int) $locked->id, $key);
            $this->assertExpectedVersion($previous, $expectedVersion, $key);

            $stored = $this->store->put('user', (int) $locked->id, $key, $value, (int) $locked->id);
            $audit = $this->audit->record($locked, 'setting.value_written', [
                'setting_key' => $key,
                'owner_type' => 'user',
                'owner_id' => (int) $locked->id,
                'version' => $stored->version,
            ], 'user', (int) $locked->id, 'setting_value', (int) $locked->id);
            $this->recordValueRevision('user', (int) $locked->id, $key, $previous->exists ? CoreSettingRevision::OPERATION_UPDATE : CoreSettingRevision::OPERATION_CREATE, $previous, $stored, (int) $locked->id, (int) $audit->id);

            return $stored;
        });
    }

    public function removeUserPreference(User $actor, string $key, ?int $expectedVersion = null): void
    {
        DB::transaction(function () use ($actor, $key, $expectedVersion): void {
            $locked = User::query()->whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $this->assertOperational($locked);
            $this->registry->get($key);
            $current = $this->store->get('user', (int) $locked->id, $key);
            $this->assertExpectedVersion($current, $expectedVersion, $key);

            $this->store->forget('user', (int) $locked->id, $key);
            $audit = $this->audit->record($locked, 'setting.value_removed', [
                'setting_key' => $key,
                'owner_type' => 'user',
                'owner_id' => (int) $locked->id,
                'version' => $current->version,
            ], 'user', (int) $locked->id, 'setting_value', (int) $locked->id);
            $this->recordValueRevision('user', (int) $locked->id, $key, CoreSettingRevision::OPERATION_REMOVE, $current, StoredSettingValue::absent(), (int) $locked->id, (int) $audit->id);
        });
    }

    // -- Organization override policies -----------------------------

    /**
     * @return array{allow: bool, version: int, explicit: bool}
     */
    public function setOverridePolicy(User $actor, Organization $organization, string $key, bool $allow, ?int $expectedVersion = null): array
    {
        return DB::transaction(function () use ($actor, $organization, $key, $allow, $expectedVersion): array {
            $locked = $this->lockOrganization($organization);
            $this->assertOperational($actor);
            $this->assertOrganizationOperational($locked);
            $this->assertOrganizationPermission($actor, $locked, self::ORGANIZATION_MANAGE);
            $this->registry->get($key);

            // The expected-version check runs authoritatively
            // inside the store under the policy row lock.
            $before = $this->store->policyDecision((int) $locked->id, $key);
            $decision = $this->store->putOverridePolicy((int) $locked->id, $key, $allow, (int) $actor->id, $expectedVersion);
            $audit = $this->audit->record($actor, 'setting.override_policy_updated', [
                'setting_key' => $key,
                'organization_id' => (int) $locked->id,
                'allow_workspace_override' => $allow,
                'version' => $decision['version'],
            ], 'organization', (int) $locked->id, 'setting_override_policy', (int) $locked->id);
            if ($this->registry->get($key)->sensitivity !== SettingDefinition::SENSITIVITY_SECRET) {
                $this->revisions->record(
                    'organization',
                    (int) $locked->id,
                    $key,
                    CoreSettingRevision::OPERATION_POLICY,
                    new StoredSettingValue((bool) $before['explicit'], $before['allow'], $before['version']),
                    new StoredSettingValue(true, $decision['allow'], $decision['version']),
                    (int) $decision['version'],
                    (int) $actor->id,
                    (int) $audit->id,
                );
            }

            return $decision;
        });
    }

    // -- Guards ------------------------------------------------------

    private function lockOrganization(Organization $organization): Organization
    {
        return Organization::query()->whereKey($organization->id)->lockForUpdate()->firstOrFail();
    }

    /**
     * Lock order (documented, consistent with C3/C6): the owning
     * Organization row first, then the Workspace row, then any
     * membership/setting rows touched inside.
     *
     * @return array{0: Workspace, 1: Organization|null}
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
            throw new SettingServiceException('setting_organization_unavailable', 'The organization is not operational, so its settings cannot be changed.');
        }
    }

    private function assertOrganizationPermission(User $actor, Organization $organization, string $permission): void
    {
        if (! $this->permissions->userHasOrganizationPermission($actor, $organization, $permission)) {
            throw new SettingServiceException('setting_forbidden', 'The actor lacks settings authority in this organization.');
        }
    }

    private function assertWorkspacePermission(User $actor, Workspace $workspace, string $permission): void
    {
        if (! $this->permissions->userHasWorkspacePermission($actor, $workspace, $permission)) {
            throw new SettingServiceException('setting_forbidden', 'The actor lacks settings authority in this workspace.');
        }
    }

    /**
     * Definition gates shared by writes: must be registered,
     * scope-eligible, non-secret, and module-writable.
     *
     * @throws SettingRegistryException|SettingValidationException|SettingServiceException
     */
    private function definitionForWrite(string $key, string $scope, ?Workspace $workspace): SettingDefinition
    {
        $definition = $this->registry->get($key);

        if (! in_array($scope, $definition->allowedScopes, true)) {
            throw new SettingValidationException('setting_scope_not_allowed', "Setting [{$key}] cannot be written in scope [{$scope}].");
        }

        $this->assertNotSecret($definition);
        $this->assertModuleWritable($definition, $workspace);

        return $definition;
    }

    private function assertNotSecret(SettingDefinition $definition): void
    {
        if ($definition->sensitivity === SettingDefinition::SENSITIVITY_SECRET) {
            throw new SettingValidationException('setting_secret_not_storable', "Setting [{$definition->key}] is secret and can never be written through the generic settings path.");
        }
    }

    /**
     * Module boundary (Stage C7-2 §5): Core settings are always
     * available. A business module's operational settings may be
     * written only while the module is catalog-Available and, for
     * Workspace scope, ENABLED on that Workspace. Stored values of
     * disabled modules are preserved — writes are denied, data is
     * never deleted or rewritten by this check.
     */
    private function assertModuleWritable(SettingDefinition $definition, ?Workspace $workspace): void
    {
        if ($definition->owner === SettingDefinition::OWNER_CORE) {
            return;
        }

        $module = ModuleCatalog::get($definition->owner);
        if ($module === null || ! $module->isAvailable()) {
            throw new SettingServiceException('setting_module_unavailable', "Module [{$definition->owner}] is not available, so its settings cannot be edited.");
        }

        if ($workspace !== null && ! in_array($definition->owner, $this->modulePlanner->enabledModuleKeys($workspace), true)) {
            throw new SettingServiceException('setting_module_disabled', "Module [{$definition->owner}] is disabled for this workspace, so its settings cannot be edited.");
        }
    }

    private function assertExpectedVersion(StoredSettingValue $current, ?int $expectedVersion, string $key): void
    {
        if ($expectedVersion === null) {
            return;
        }

        $currentVersion = $current->exists ? (int) $current->version : 0;
        if ($expectedVersion !== $currentVersion) {
            throw new SettingServiceException('setting_version_conflict', "Setting [{$key}] has changed; reload before writing.");
        }
    }

    /**
     * Records the immutable revision for a value mutation, inside
     * the caller's transaction (Stage C7-3). Secret definitions
     * never reach this path (rejected by definitionForWrite).
     */
    private function recordValueRevision(string $ownerType, int $ownerId, string $key, string $operation, StoredSettingValue $previous, StoredSettingValue $new, int $actorId, int $auditLogId): void
    {
        $this->revisions->record(
            $ownerType,
            $ownerId,
            $key,
            $operation,
            $previous,
            $new,
            (int) ($new->exists ? $new->version : $previous->version),
            $actorId,
            $auditLogId,
        );
    }

    /**
     * Stage C7-3 — authorized, immutable history for one key in a
     * scope (newest first). Metadata only ever describes NON-secret
     * settings; secret keys have no readable history.
     *
     * @return list<array{id: int, operation: string, version: int, previous_present: bool, previous_value: mixed, new_present: bool, new_value: mixed, actor_user_id: int|null, created_at: string|null}>
     */
    public function revisionsFor(User $actor, string $key, ?Organization $organization = null, ?Workspace $workspace = null): array
    {
        $this->assertOperational($actor);
        $definition = $this->registry->get($key);

        if ($definition->sensitivity === SettingDefinition::SENSITIVITY_SECRET) {
            throw new SettingServiceException('setting_history_unavailable', 'Secret settings have no readable history.');
        }

        if ($workspace !== null) {
            $this->assertWorkspacePermission($actor, $workspace, self::WORKSPACE_VIEW);
            [$ownerType, $ownerId] = [SettingDefinition::SCOPE_WORKSPACE, (int) $workspace->id];
        } elseif ($organization !== null) {
            $this->assertOrganizationPermission($actor, $organization, self::ORGANIZATION_VIEW);
            [$ownerType, $ownerId] = [SettingDefinition::SCOPE_ORGANIZATION, (int) $organization->id];
        } else {
            [$ownerType, $ownerId] = [SettingDefinition::SCOPE_USER, (int) $actor->id];
        }

        return CoreSettingRevision::query()
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $key)
            ->orderByDesc('id')
            ->get()
            ->map(fn (CoreSettingRevision $revision): array => [
                'id' => (int) $revision->id,
                'operation' => $revision->operation,
                'version' => (int) $revision->version,
                'previous_present' => (bool) $revision->previous_present,
                'previous_value' => $revision->previousValue(),
                'new_present' => (bool) $revision->new_present,
                'new_value' => $revision->newValue(),
                'actor_user_id' => $revision->actor_user_id !== null ? (int) $revision->actor_user_id : null,
                'created_at' => $revision->created_at?->toIso8601String(),
            ])
            ->all();
    }

    /**
     * Stage C7-3 — restore one Organization value to a prior
     * revision. Reauthorized and revalidated against the CURRENT
     * rules at restore time; commits as a new version with its
     * own audit + revision; the prior chain is never rewritten.
     */
    public function restoreOrganizationValue(User $actor, Organization $organization, string $key, int $revisionId, ?int $expectedVersion = null): StoredSettingValue
    {
        return DB::transaction(function () use ($actor, $organization, $key, $revisionId, $expectedVersion): StoredSettingValue {
            $locked = $this->lockOrganization($organization);
            $this->assertOperational($actor);
            $this->assertOrganizationOperational($locked);
            $this->assertOrganizationPermission($actor, $locked, self::ORGANIZATION_MANAGE);

            return $this->applyRestore($actor, 'organization', (int) $locked->id, $key, $revisionId, $expectedVersion, null);
        });
    }

    public function restoreWorkspaceValue(User $actor, Workspace $workspace, string $key, int $revisionId, ?int $expectedVersion = null): StoredSettingValue
    {
        return DB::transaction(function () use ($actor, $workspace, $key, $revisionId, $expectedVersion): StoredSettingValue {
            [$lockedWorkspace, $lockedOrganization] = $this->lockWorkspaceContext($workspace);
            $this->assertOperational($actor);
            if ($lockedOrganization !== null) {
                $this->assertOrganizationOperational($lockedOrganization);
            }
            $this->assertWorkspacePermission($actor, $lockedWorkspace, self::WORKSPACE_MANAGE);

            return $this->applyRestore($actor, 'workspace', (int) $lockedWorkspace->id, $key, $revisionId, $expectedVersion, $lockedWorkspace);
        });
    }

    public function restoreUserPreference(User $actor, string $key, int $revisionId, ?int $expectedVersion = null): StoredSettingValue
    {
        return DB::transaction(function () use ($actor, $key, $revisionId, $expectedVersion): StoredSettingValue {
            $locked = User::query()->whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $this->assertOperational($locked);

            return $this->applyRestore($locked, 'user', (int) $locked->id, $key, $revisionId, $expectedVersion, null);
        });
    }

    /**
     * Shared restore algorithm. The caller has already locked the
     * scope container and authorized the actor; this method
     * re-checks the write gates for the TARGET scope (definition,
     * module state, definition scope), enforces the workspace
     * override policy for workspace restores, validates the
     * historical value against the CURRENT definition, and checks
     * the expected version against the CURRENT stored state.
     */
    private function applyRestore(User $actor, string $ownerType, int $ownerId, string $key, int $revisionId, ?int $expectedVersion, ?Workspace $workspaceContext): StoredSettingValue
    {
        $definition = $this->definitionForWrite($key, $ownerType, $workspaceContext);

        $revision = CoreSettingRevision::query()
            ->whereKey($revisionId)
            ->where('owner_type', $ownerType)
            ->where('owner_id', $ownerId)
            ->where('setting_key', $key)
            ->first();

        if ($revision === null) {
            throw new SettingServiceException('setting_revision_not_found', 'The requested revision does not exist for this setting and scope.');
        }

        if ($ownerType === SettingDefinition::SCOPE_WORKSPACE) {
            // Current override policy and definition gates apply.
            if (! $definition->workspaceOverride) {
                throw new SettingValidationException('setting_override_not_supported', "Setting [{$key}] does not support Workspace overrides.");
            }
            $organization = $workspaceContext?->organization_id !== null
                ? Organization::query()->whereKey($workspaceContext->organization_id)->first()
                : null;
            $allowed = $organization !== null
                ? $this->store->allowsWorkspaceOverride((int) $organization->id, $key)
                : $definition->workspaceOverrideDefault;
            if (! $allowed && $revision->new_present) {
                throw new SettingServiceException('setting_override_denied', 'The organization does not currently allow Workspace overrides for this setting.');
            }
        }

        $current = $this->store->get($ownerType, $ownerId, $key);
        $this->assertExpectedVersion($current, $expectedVersion, $key);

        if ($revision->new_present) {
            // Revalidate the historical value against today's schema.
            $value = SettingValueValidator::validate($definition, $revision->newValue());
            $stored = $this->store->put($ownerType, $ownerId, $key, $value, (int) $actor->id);
        } else {
            // Restoring absence removes the explicit override —
            // no false/null substitute is stored.
            $this->store->forget($ownerType, $ownerId, $key);
            $stored = StoredSettingValue::absent();
        }

        $audit = $this->audit->record($actor, 'setting.value_restored', [
            'setting_key' => $key,
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'revision_id' => $revisionId,
            'version' => $stored->exists ? $stored->version : $current->version,
        ], $ownerType, $ownerId, 'setting_value', $ownerId);

        $this->recordValueRevision($ownerType, $ownerId, $key, CoreSettingRevision::OPERATION_RESTORE, $current, $stored, (int) $actor->id, (int) $audit->id);

        return $stored;
    }
}
