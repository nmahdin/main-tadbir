<?php

namespace App\Core\Modules;

use App\Core\Authorization\AuthorizationService;
use App\Core\Authorization\WorkspaceContext;
use App\Core\Plans\Contracts\SubscriptionAccessEvaluator;
use App\Core\Plans\ModuleAccessLevel;
use App\Core\Workspaces\Workspace;
use App\Models\User;

/**
 * Reusable operational access guard for business modules
 * (C4-2, operation-aware since C5-3).
 *
 * Layers module-operational checks OVER workspace authorization —
 * it never replaces RBAC. Evaluation order (fail-closed at every
 * step; a suspended/ended organization has already been denied by
 * context resolution, which always outranks subscriptions):
 *
 *   1. central authorization (active account, workspace, active
 *      memberships, effective role permission) — authorize() only;
 *   2. module known in the canonical catalog;
 *   3. module technically available (implemented);
 *   4. organization policy: explicit deny blocks;
 *   5. module enabled in this workspace (absent row = disabled) —
 *      a disabled module is inaccessible in EVERY subscription
 *      state, including expired read-only;
 *   6. subscription entitlement level from the C5 evaluator:
 *        Full / Grace -> all operations;
 *        ReadOnly     -> safe reads only (Write/Execute denied
 *                        with module_read_only);
 *        Denied       -> everything denied.
 *
 * Core identity, membership, and audit operations never pass
 * through this guard: they are not toggleable modules.
 */
final class ModuleAccessGuard
{
    public function __construct(
        private readonly AuthorizationService $authorization,
        private readonly SubscriptionAccessEvaluator $entitlements,
    ) {}

    public function authorize(
        User $user,
        int|string $workspaceId,
        string $permissionKey,
        string $moduleKey,
        ModuleOperation $operation = ModuleOperation::Write,
    ): WorkspaceContext {
        $context = $this->authorization->authorize($user, $workspaceId, $permissionKey);
        $this->assertOperational($context, $moduleKey, $operation);

        return $context;
    }

    /**
     * Full operational assertion for an already-authorized context,
     * including the subscription level for the given operation.
     */
    public function assertOperational(
        WorkspaceContext $context,
        string $moduleKey,
        ModuleOperation $operation = ModuleOperation::Write,
    ): void {
        $this->assertModuleEnabled($context, $moduleKey);

        $level = $this->entitlements->accessLevel($context->workspace, $moduleKey);

        if ($level === ModuleAccessLevel::Full || $level === ModuleAccessLevel::Grace) {
            return;
        }

        if ($level === ModuleAccessLevel::ReadOnly && $operation->isSafeRead()) {
            return;
        }

        if ($level === ModuleAccessLevel::ReadOnly) {
            throw new ModuleAccessDeniedException(
                ModuleAccessDeniedException::MODULE_READ_ONLY,
                "Module [{$moduleKey}] is read-only in this workspace (subscription expired).",
            );
        }

        throw new ModuleAccessDeniedException(
            ModuleAccessDeniedException::ENTITLEMENT_MISSING,
            "No valid entitlement for module [{$moduleKey}] in this workspace.",
        );
    }

    /**
     * Availability + organization policy + workspace activation,
     * without the entitlement step. Exists for consumers whose
     * entitlement decision is already made by another authorized
     * layer; it never grants entitlement semantics of its own.
     */
    public function assertModuleEnabled(WorkspaceContext $context, string $moduleKey): void
    {
        $definition = ModuleCatalog::get($moduleKey);

        if ($definition === null) {
            throw new ModuleAccessDeniedException(
                ModuleAccessDeniedException::MODULE_UNKNOWN,
                "Module [{$moduleKey}] is not a known module.",
            );
        }

        if (! $definition->isAvailable()) {
            throw new ModuleAccessDeniedException(
                ModuleAccessDeniedException::MODULE_UNAVAILABLE,
                "Module [{$moduleKey}] is not technically available.",
            );
        }

        $workspace = $context->workspace;

        if ($this->organizationDenies($workspace, $moduleKey)) {
            throw new ModuleAccessDeniedException(
                ModuleAccessDeniedException::ORGANIZATION_POLICY_DENIED,
                "Organization policy denies module [{$moduleKey}].",
            );
        }

        $enabled = WorkspaceModule::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', WorkspaceModule::STATUS_ENABLED)
            ->whereHas('module', fn ($query) => $query->where('key', $moduleKey))
            ->exists();

        if (! $enabled) {
            throw new ModuleAccessDeniedException(
                ModuleAccessDeniedException::MODULE_NOT_ENABLED,
                "Module [{$moduleKey}] is not enabled in this workspace.",
            );
        }
    }

    private function organizationDenies(Workspace $workspace, string $moduleKey): bool
    {
        if ($workspace->organization_id === null) {
            return false;
        }

        return OrganizationModulePolicy::query()
            ->where('organization_id', $workspace->organization_id)
            ->where('policy', OrganizationModulePolicy::POLICY_DENIED)
            ->whereHas('module', fn ($query) => $query->where('key', $moduleKey))
            ->exists();
    }
}
