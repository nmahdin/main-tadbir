<?php

namespace App\Core\Authorization;

use App\Core\Authorization\Contracts\ModuleAvailabilityGate;
use App\Core\Authorization\Contracts\OrganizationPolicyGate;
use App\Core\Authorization\Contracts\SubscriptionEntitlementGate;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RbacValidationException;
use App\Models\User;
use Throwable;

/**
 * The one central authorization decision (Stage 04A, ADR-0008,
 * core.md §2.1). Plain service with no HTTP dependency: controllers,
 * console commands, jobs, and the Bale/Google integrations all call
 * this same decision (consumers migrate incrementally in later
 * stages; legacy module checks stay operational until then).
 *
 * Decision order: active account -> workspace resolution -> active
 * workspace membership -> active organization membership (org
 * workspaces) -> role permission -> [module availability -> org
 * policy -> subscription entitlement, only for module operations].
 * Deny-by-default. When a moduleId is given, every gate must
 * affirmatively allow: an unimplemented gate is a denial, never a
 * placeholder grant.
 */
final class AuthorizationService
{
    private readonly WorkspaceContextResolver $contexts;

    private readonly ModuleAvailabilityGate $moduleGate;

    private readonly OrganizationPolicyGate $policyGate;

    private readonly SubscriptionEntitlementGate $entitlementGate;

    public function __construct(
        ?WorkspaceContextResolver $contexts = null,
        ?ModuleAvailabilityGate $moduleGate = null,
        ?OrganizationPolicyGate $policyGate = null,
        ?SubscriptionEntitlementGate $entitlementGate = null,
    ) {
        $this->contexts = $contexts ?? new WorkspaceContextResolver;
        $this->moduleGate = $moduleGate ?? new UnimplementedModuleAvailabilityGate;
        $this->policyGate = $policyGate ?? new UnimplementedOrganizationPolicyGate;
        $this->entitlementGate = $entitlementGate ?? new UnimplementedSubscriptionEntitlementGate;
    }

    /**
     * @throws AuthorizationException when no valid context exists
     */
    public function resolveContext(User $user, int|string|null $workspaceId): WorkspaceContext
    {
        try {
            return $this->contexts->resolve($user, $workspaceId);
        } catch (Throwable $exception) {
            $this->rethrowConcurrency($exception);

            throw $exception;
        }
    }

    /**
     * Full decision for one operation. Returns the resolved context on
     * success so callers can scope queries with it.
     *
     * @throws AuthorizationException on any denial
     * @throws RbacValidationException on unknown/mis-scoped permission keys
     */
    public function authorize(User $user, int|string|null $workspaceId, string $permissionKey, ?string $moduleId = null): WorkspaceContext
    {
        $context = $this->resolveContext($user, $workspaceId);
        $this->assertPermission($context, $permissionKey);

        if ($moduleId !== null) {
            $this->assertGatesAllow($context, $permissionKey, $moduleId);
        }

        return $context;
    }

    /**
     * @throws AuthorizationDeniedException when the permission is missing
     * @throws RbacValidationException on unknown/mis-scoped permission keys
     */
    public function assertPermission(WorkspaceContext $context, string $permissionKey): void
    {
        PermissionCatalog::assertKnownKeysForScope([$permissionKey], PermissionCatalog::SCOPE_WORKSPACE);

        if (! $context->hasPermission($permissionKey)) {
            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::PERMISSION_MISSING,
                "The workspace role does not hold permission [{$permissionKey}].",
            );
        }
    }

    /**
     * Non-throwing convenience for read paths. False for every denial
     * or invalid input (including unknown permission keys); unexpected
     * errors are not swallowed.
     */
    public function can(User $user, int|string|null $workspaceId, string $permissionKey, ?string $moduleId = null): bool
    {
        try {
            $this->authorize($user, $workspaceId, $permissionKey, $moduleId);

            return true;
        } catch (AuthorizationException|RbacValidationException) {
            return false;
        }
    }

    private function assertGatesAllow(WorkspaceContext $context, string $permissionKey, string $moduleId): void
    {
        $decisions = [
            'module availability' => $this->moduleGate->evaluate($context->workspace, $moduleId),
            'organization policy' => $this->policyGate->evaluate($context->workspace, $permissionKey),
            'subscription entitlement' => $this->entitlementGate->evaluate($context->workspace, $moduleId),
        ];

        foreach ($decisions as $gate => $decision) {
            if ($decision->isAllowed()) {
                continue;
            }

            if ($decision->isUnavailable()) {
                throw new AuthorizationDeniedException(
                    AuthorizationDeniedException::GATE_UNIMPLEMENTED,
                    "The {$gate} gate is not implemented; failing closed. ".($decision->reason ?? ''),
                );
            }

            throw new AuthorizationDeniedException(
                AuthorizationDeniedException::GATE_DENIED,
                "Denied by the {$gate} gate. ".($decision->reason ?? ''),
            );
        }
    }

    private function rethrowConcurrency(Throwable $exception): void
    {
        if (ConcurrencyErrors::isRetryable($exception)) {
            throw ConcurrencyErrors::wrap($exception);
        }
    }
}
