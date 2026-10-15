# TADBIR — Central Authorization Engine (Stage 04A)

- **Status:** IMPLEMENTED as foundation (Stage 04A; approved architecture ADR-0008, core.md §2.1). No business module consumes it yet; per-module adoption is Stage 04B/05 work.
- **Code:** `backend/app/Core/Authorization/` (+ `App\Core\Rbac` from Stage 03B). Core depends on no business module.

## 1. The one decision

`App\Core\Authorization\AuthorizationService` is the single server-side authorization decision for workspace-scoped operations. It is a plain service (no HTTP dependency), so HTTP controllers, console commands, background jobs, and the Bale/Google integrations can all call the same decision; adapters must never keep parallel permission copies (ADR-0008 §2).

Decision order (deny-by-default at every step):

1. **Platform-active account** — the user row is re-read (`refresh()`) so mid-session suspensions and database-defaulted attributes are honored, matching `EnsureActiveAccount` semantics.
2. **Workspace resolution** — a client-supplied workspace identifier is only a lookup key. Malformed, zero/negative, or nonexistent identifiers produce an *invalid context* (404), never a fallback workspace.
3. **Active workspace** — suspended/inactive workspaces deny.
4. **Active workspace membership** — missing, deactivated, and ended memberships deny with distinct reason codes.
5. **Active organization membership** — additionally required for organizational workspaces (ADR-0003). Organization authority alone never resolves a workspace context.
6. **Role permission** — the membership's single scoped role (Stage 03B) must hold the requested catalog key. Unknown or cross-scope keys are rejected (422 via `RbacValidationException`), never silently granted.
7. **Higher gates, module operations only** — when a caller names a `moduleId`, module availability → organization policy → subscription entitlement must each affirmatively allow.

On success the caller receives a `WorkspaceContext` snapshot (user, workspace, both memberships, role, effective permission keys) and scopes all data access with it. Decisions are re-resolved per operation — there is no caching, so demotions and deactivations take effect on the next call.

## 2. Higher gates: contracts, fail-closed

Subscriptions (Q-01) and module activation (Stage 07) do not exist yet, so Stage 04A defines only the contracts in `App\Core\Authorization\Contracts\`: `ModuleAvailabilityGate`, `OrganizationPolicyGate`, `SubscriptionEntitlementGate`, each returning a three-state `GateDecision` (allowed / denied / unavailable). The default `Unimplemented*Gate` implementations honestly report *unavailable*, and the central service treats unavailable exactly like a denial (`gate_unimplemented`, 403). **No production-facing module operation can be authorized through a placeholder grant.** Real implementations replace the defaults by constructor injection in their owning stages; the engine's behavior does not otherwise change.

### 2.1 Future container registration (documented, NOT implemented in 04A)

`AuthorizationService` takes the three gates as nullable constructor parameters and falls back to the `Unimplemented*Gate` classes when a parameter is null. When a gate's owning stage implements it (Stage 06 subscriptions — after Q-01 ratification — Stage 07 module activation, organization-policy slice), that stage registers the real implementation in **its own service provider** with a plain container binding, e.g.:

```php
// Owning stage's service provider (future; does not exist yet):
public function register(): void
{
    $this->app->bind(
        \App\Core\Authorization\Contracts\SubscriptionEntitlementGate::class,
        \App\Core\Billing\SubscriptionEntitlementGate::class, // future class
    );
}
```

Two operational rules follow from the constructor design:

1. **Consumers must resolve `AuthorizationService` through the container** (`app(AuthorizationService::class)` or constructor injection). A manual `new AuthorizationService()` bypasses the container, receives `null` gates, and therefore keeps failing closed with the unimplemented defaults — a safe failure mode, but not the intended wiring.
2. **No binding is registered in Stage 04A and no provider is created for this purpose.** Until the owning stage adds its binding, every resolution in every environment receives the unimplemented gates and module operations deny. Tests that exercise implemented gates construct the service with stub implementations directly (see `CoreAuthorizationTest`), which proves the seam without enabling any production behavior.

## 3. Query scoping and record ownership

- `WorkspaceScope::apply($query, $context)` constrains list queries server-side; `assertRecordInContext()` and `assertNestedInContext()` validate records fetched by direct or nested IDs. Foreign and nonexistent records are indistinguishable (404), so ID probing learns nothing (IDOR-safe).
- Module models adopt the `WorkspaceOwned` contract via the `ScopesToWorkspace` trait (`workspace()` relation, `forWorkspace`/`forContext` scopes, `isInWorkspace`) when they migrate in Stage 05. Stage 04A changes no legacy model; a test double proves the contract against a real table.

## 4. Failure taxonomy (all surfaces map the same decision)

| Failure | Exception | HTTP | Meaning |
|---|---|---|---|
| Not authorized | `AuthorizationDeniedException` (stable `reason()` codes: `account_inactive`, `workspace_inactive`, `workspace_membership_missing/inactive`, `organization_membership_missing/inactive`, `permission_missing`, `gate_unimplemented`, `gate_denied`) | 403 | Authenticated but may not |
| Invalid context | `InvalidAuthorizationContextException` (`workspace_not_found`, `record_outside_workspace`, `record_outside_parent`) | 404 | No such valid context/record |
| Transient concurrency | `RetryableAuthorizationException` (via `ConcurrencyErrors::isRetryable/wrap`: MySQL 1205/1213, 40001, SQLite busy) | 503 | Safe to retry; never converted into a grant |
| Invalid request contract | `RbacValidationException` (unknown/cross-scope permission keys) | 422 | Caller bug, fail explicit |

`AuthorizationService::can()` is the non-throwing variant for read paths: false on any denial/invalid input, unexpected errors propagate.

## 5. Coexistence and adoption

Legacy modules keep their existing authorization **unchanged and operational** (ADR-0008 §4). Adoption per module (Stage 04B pilot, Stage 05 rollout): resolve context at the entry point, assert the module permission, scope every query with the context, assert record ownership for ID-bearing routes, and delete the module's legacy checks in the same change with its adversarial tests green. Until a module migrates, it must not mix the two decisions; migrated modules must not fall back to legacy checks. The Core foundation endpoints likewise keep their Stage 03A/03B behavior in this stage.

Out of scope here and unchanged: audit logging of decisions (Stage 04B+ wiring, ADR-0008 §6), platform-admin scope (Q-10, no bypass exists in the resolver), invitations (Q-08), signed-file links (Q-09).
