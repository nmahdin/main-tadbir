<?php

namespace App\Core\Modules;

use App\Core\Audit\AuditWriter;
use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Organizations\OrganizationAccessGuard;
use App\Core\Rbac\MembershipPermissions;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Atomic workspace module activation / safe deactivation (C4-2).
 *
 * Authorization: the actor must hold the workspace-scoped
 * `workspace.modules.manage` permission through the central
 * authorization service (operationally active account, active
 * workspace + memberships, effective role permission, organization
 * lifecycle enforced by context resolution). Platform status,
 * organization ownership, and the legacy Admin role confer NOTHING.
 *
 * Lock order (documented, consistent with the RBAC services):
 *   1. workspace row (FOR UPDATE)
 *   2. organization row (FOR UPDATE, organization-owned only)
 *   3. workspace_modules rows for the workspace
 * No authorization or activation decision inside the transaction
 * trusts pre-transaction state: the preview (activation state,
 * organization policies, registry availability, entitlements) is
 * recomputed under the locks and the caller's confirmation token
 * must still match — otherwise the activation is rejected as stale
 * (409 module_activation_preview_stale) and nothing changes.
 *
 * Deactivation never cascades and never deletes data: it is
 * rejected while any direct or transitive dependent is enabled in
 * the same Workspace (409 module_has_active_dependents), and the
 * activation row (history) is preserved with status disabled.
 */
final class WorkspaceModuleService
{
    public const PERMISSION = 'workspace.modules.manage';

    public function __construct(
        private readonly AuthorizationService $authorization,
        private readonly MembershipPermissions $permissions,
        private readonly OrganizationAccessGuard $organizationGuard,
        private readonly ModuleActivationPlanner $planner,
        private readonly ModuleDependencyResolver $resolver,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * Enable the target module and every not-yet-enabled
     * prerequisite, atomically. Returns the module keys that were
     * newly enabled (dependency-first, target last).
     *
     * @return list<string>
     */
    public function activate(User $actor, Workspace $workspace, string $moduleKey, string $confirmationToken): array
    {
        $this->authorization->authorize($actor, $workspace->id, self::PERMISSION);

        return DB::transaction(function () use ($actor, $workspace, $moduleKey, $confirmationToken): array {
            $locked = $this->lockWorkspace($workspace);
            $this->assertAuthorizedUnderLock($actor, $locked);

            $preview = $this->planner->preview($locked, $moduleKey);

            if (! hash_equals($preview->confirmationToken, $confirmationToken)) {
                throw new ModuleActivationException(
                    'module_activation_preview_stale',
                    'The activation preview is stale; re-preview the module and confirm again.',
                    409,
                );
            }

            if (! $preview->confirmable()) {
                $first = $preview->blockingReasons[0];

                throw new ModuleActivationException(
                    $first['code'],
                    $first['message'],
                    $first['code'] === 'entitlement_missing' || $first['code'] === 'organization_policy_denied' ? 403 : 422,
                );
            }

            $enabledBy = (int) $actor->id;
            $now = now();

            foreach ($preview->toEnable as $key) {
                $this->writeActivation($locked, $key, WorkspaceModule::STATUS_ENABLED, $enabledBy, $now);

                $this->audit->record(
                    $actor,
                    'workspace.module_enabled',
                    ['workspace_id' => (int) $locked->id, 'module' => $key, 'activation_role' => $key === $moduleKey ? 'target' : 'prerequisite'],
                    'workspace',
                    (int) $locked->id,
                    'workspace',
                    (int) $locked->id,
                );
            }

            return $preview->toEnable;
        });
    }

    /**
     * Disable one module. Rejected while any direct or transitive
     * dependent is enabled in the same Workspace. Idempotent:
     * disabling an already disabled module is a no-op.
     */
    public function deactivate(User $actor, Workspace $workspace, string $moduleKey): void
    {
        $this->authorization->authorize($actor, $workspace->id, self::PERMISSION);

        if (ModuleCatalog::get($moduleKey) === null) {
            throw new ModuleActivationException('module_unknown', "Module [{$moduleKey}] is not a known module.");
        }

        DB::transaction(function () use ($actor, $workspace, $moduleKey): void {
            $locked = $this->lockWorkspace($workspace);
            $this->assertAuthorizedUnderLock($actor, $locked);

            $enabledDependents = array_values(array_intersect(
                $this->resolver->allDependentsOf($moduleKey),
                $this->planner->enabledModuleKeys($locked),
            ));

            if ($enabledDependents !== []) {
                throw new ModuleActivationException(
                    'module_has_active_dependents',
                    'Module cannot be disabled while dependent modules are enabled.',
                    409,
                    $enabledDependents,
                );
            }

            $row = $this->activationRow($locked, $moduleKey);

            if ($row === null || ! $row->isEnabled()) {
                return; // idempotent no-op; nothing was enabled
            }

            $row->forceFill([
                'status' => WorkspaceModule::STATUS_DISABLED,
                'disabled_at' => now(),
                'disabled_by_user_id' => (int) $actor->id,
            ])->save();

            $this->audit->record(
                $actor,
                'workspace.module_disabled',
                ['workspace_id' => (int) $locked->id, 'module' => $moduleKey],
                'workspace',
                (int) $locked->id,
                'workspace',
                (int) $locked->id,
            );
        });
    }

    private function writeActivation(Workspace $workspace, string $moduleKey, string $status, int $actorId, mixed $now): void
    {
        $module = CoreModule::query()->where('key', $moduleKey)->firstOrFail();

        WorkspaceModule::updateOrCreate(
            ['workspace_id' => $workspace->id, 'module_id' => $module->id],
            [
                'status' => $status,
                'enabled_at' => $now,
                'enabled_by_user_id' => $actorId,
                'disabled_at' => null,
                'disabled_by_user_id' => null,
            ],
        );
    }

    private function activationRow(Workspace $workspace, string $moduleKey): ?WorkspaceModule
    {
        return WorkspaceModule::query()
            ->where('workspace_id', $workspace->id)
            ->whereHas('module', fn ($query) => $query->where('key', $moduleKey))
            ->lockForUpdate()
            ->first();
    }

    /**
     * Lock order: workspace row, then organization row. Returns the
     * locked workspace with its organization relation loaded.
     */
    private function lockWorkspace(Workspace $workspace): Workspace
    {
        $locked = Workspace::query()->whereKey($workspace->id)->lockForUpdate()->firstOrFail();

        if ($locked->organization_id !== null) {
            $organization = $locked->organization()->lockForUpdate()->first();
            $locked->setRelation('organization', $organization);
        }

        return $locked;
    }

    /**
     * Re-verify, under the locks, that the organization still
     * permits operational access (suspended/ended organizations can
     * never activate or deactivate modules) and that the actor still
     * holds the module-management permission in this workspace.
     */
    private function assertAuthorizedUnderLock(User $actor, Workspace $locked): void
    {
        if ($locked->organization_id !== null) {
            $this->organizationGuard->assertOperationalAccess($locked->organization);
        }

        if (! $this->permissions->userHasWorkspacePermission($actor, $locked, self::PERMISSION)) {
            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::PERMISSION_MISSING,
                'The workspace module management permission is required.',
            );
        }
    }
}
