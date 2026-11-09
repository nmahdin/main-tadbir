# Stage C4-2 Completion Report — Workspace Module Activation, Dependency Planning & Operational Access Control

Status: **implemented, CI-green, pending explicit human acceptance** (not approved). PR #14 remains OPEN and unmerged; nothing was merged to `main`; no production system was touched.

## Starting / final HEAD

- Starting HEAD: `e465d5a` (C4-1 final, verified equal to remote).
- Final HEAD: see the closing commit of this stage on `arena/582a70e5-main-tadbir` (report commit). All stage commits are small and labeled `C4-2: …`; three temporary CI-diagnostics commits (`TEMP …`) were fully reverted — a final diff check confirms the workflow change that remains is only the added MySQL test file in the MySQL step.

## Authorization contract

- New workspace-scoped permission **`workspace.modules.manage`** (catalog naming `workspace.<area>.manage`, per the established convention). Added to `PermissionCatalog`; `PermissionCatalog::sync()` inserts the permission row idempotently.
- Effect on roles, explicit and tested: the protected **Workspace Manager** role is defined as *every workspace-scope catalog key*, so it gains the key through the existing `RoleProvisioner` sync (idempotent). **Workspace Member** stays `workspace.view` only. **Custom roles are never modified** by sync/provisioning; the key reaches them only through an explicit grant by an authorized manager (existing role services). Organization-scope and platform-scope roles gain nothing.
- Module-management authority requires ALL of: operationally active account, active workspace, active workspace membership, effective `workspace.modules.manage` permission, and (organization-owned) an active organization — enforced by reusing the central `AuthorizationService` (no parallel logic). Verified by tests: plain member denied; manager of another workspace denied; Platform Primary Administrator without workspace membership denied; suspended account denied. Platform status, organization ownership, and the legacy Admin role confer nothing.

## Activation planner (read-only)

`ModuleActivationPlanner::preview()` returns an immutable `ModuleActivationPreview`: target, **direct+transitive prerequisites in dependency-first order**, already-enabled vs to-enable partition (target last), per-module technical availability, per-module organization policy (`allowed|denied|none` — tri-state; absence is *no decision*, never a grant), per-module entitlement outcome (for newly enabled modules), structured blocking reasons (`module_unavailable`, `organization_policy_denied`, `entitlement_missing`), and a **deterministic confirmation token** = SHA-256 over {workspace id, module key, relevant enabled set, relevant policies, catalog fingerprint}. Unknown target → `module_unknown` (fail-closed). The planner never writes; a test asserts zero activation rows after previews. Unrelated workspace state does not affect the token.

## Atomic activation

`WorkspaceModuleService::activate($actor, $workspace, $moduleKey, $confirmationToken)`:

1. Central authorization (`workspace.modules.manage`) before the transaction.
2. Transaction with documented lock order: **workspace row → organization row → activation rows** (consistent with the RBAC services).
3. Under the locks: organization lifecycle re-check (`OrganizationAccessGuard`; suspended/ended can never activate), permission re-check against the locked scope, then the preview is **recomputed in-transaction** (registry availability, dependency state, activation state, organization policies, entitlements).
4. Token mismatch → `ModuleActivationException(module_activation_preview_stale, 409)`. Any blocking reason → rejected with its stable code (`entitlement_missing`/`organization_policy_denied` = 403, `module_unavailable` = 422); **nothing is enabled** — a test proves zero rows after a blocked `events` activation whose closure contains unavailable/unentitled prerequisites.
5. Otherwise prerequisites + target are enabled in dependency-first order with `enabled_at`/`enabled_by_user_id`, prior disabled metadata cleared, and **one transactional `workspace.module_enabled` audit entry per module** (summary records `activation_role: target|prerequisite`). Audit failure rolls the whole activation back (same-transaction writer, C1).
6. Re-confirming an already-enabled module is a verified no-op (still exactly one row).

No partial state is possible: enablement is a single transaction guarded by the workspace row lock.

## Safe deactivation

`WorkspaceModuleService::deactivate()`: same authorization + lock order. Resolves **direct + transitive dependents** via the C4-1 resolver; if any is enabled in the same workspace → `ModuleActivationException(module_has_active_dependents, 409)` carrying the **dependent module keys** (safe identifiers). Never cascades. Otherwise the activation row is **preserved** and marked `disabled` with `disabled_at`/`disabled_by_user_id` + `workspace.module_disabled` audit. Module data is never deleted — a test keeps a Project record across deactivation and asserts persistence. Re-deactivation is an idempotent no-op.

## Operational access guard

`ModuleAccessGuard` layers over central RBAC (never replaces it), failing closed in order: module known → technically available → organization explicit-deny → enabled in this workspace (absent row = disabled) → entitlement via the C5-owned `ModuleEntitlementGate`. The production binding remains **`UnavailableModuleEntitlementGate` (denies everything)** — there is no allow-all, dev flag, or pilot bypass; successful-activation tests inject explicit doubles. Consequence, stated plainly: **production module activation/operation stays unavailable until C5 supplies real entitlements** (for `projects`, the pre-existing non-production pilot opt-in remains the only stand-in, unchanged).

**Projects pilot integration:** `ProjectAuthorizer` (the single adapter every Projects HTTP path uses — list/create/detail/update/delete, tasks, content plans, operations, restore) now additionally requires, in scoped mode, `projects` to be available, not organization-denied, and **enabled in the workspace** (`ModuleAccessGuard::assertModuleEnabled`). Because every controller call re-authorizes per request, the check happens at the real mutation boundary; deactivation denies reads and writes immediately. The pilot's entitlement stand-in stays in its existing pilot gates (the guard's entitlement step is not double-applied to the pilot and nothing weakens the C5 default). Core identity/membership/audit paths never consult the guard. Pilot fixtures were updated to enable `projects` explicitly; a dedicated HTTP test proves 403 while disabled → 201 when enabled → 403 after deactivation with data preserved.

## Tests (all passing)

- `ModuleActivationTest` (13): permission provisioning (Manager yes / Member no / custom untouched, idempotent), deterministic non-mutating dependency-complete preview (`events` closure = 8 prerequisites), unknown module fail-closed, production entitlement default denial (403, zero rows), atomic audited idempotent activation, blocked activation enables nothing, stale token 409, permission enforcement matrix (member / cross-workspace manager / platform admin / suspended account), organization explicit-deny 403, suspended organization denial, dependent-protected deactivation (409 + dependents) with data preservation + idempotence, guard layering (not-enabled → entitlement-missing → allowed), Projects pilot HTTP disabled/enabled/disabled flow.
- `ModuleActivationConcurrencyMysqlTest` (2, wired into the CI MySQL step): competing activation blocks on the workspace row lock (MySQL 1205), then completes with committed postconditions (exactly one enabled row, one audit entry); organization suspension committed mid-activation denies at the boundary with zero activation rows.
- Full C1–C4-1 + Projects pilot regression suites pass (final CI below).

Note on coverage honesty: the canonical catalog currently implements only `projects` (no prerequisites), so multi-module atomic enablement is proven by (a) atomic single-module activation, (b) all-or-nothing rejection across an 9-module closure, and (c) transitive-dependent deactivation protection; no test fabricates catalog entries.

## Remaining dependencies

- **C5** must provide real subscription entitlements behind `ModuleEntitlementGate` (and retire the Projects pilot gates, per Stage 04B). Until then production activation is deliberately unavailable.
- **C4-3** owns module-management HTTP APIs; C4-2 is service-level only (exceptions already carry HTTP-compatible codes/statuses). Organization policy *management* workflow and frontend administration are likewise later stages.
- Bootstrap/Recovery remains **NOT PRODUCTION-READY** (production PHP-CLI-via-cron execution and production MySQL version unverified; unchanged by this stage).

## Readiness separation

- Code Complete: YES (C4-2 scope). Security Verified: within dev/CI evidence (authorization matrix, fail-closed entitlement, concurrency proofs). Dev-CI Ready: YES. Production Operationally Ready: NO (C5 entitlements absent by design; production environment unverified).

## Final CI

- Push run `39016837686` — SUCCESS (Backend contracts and tests; Backend migration gate on MySQL; Frontend typecheck, tests and artifact).
- Pull-request run `39016842077` — SUCCESS (same three jobs).
- Pushed to `arena/582a70e5-main-tadbir`; PR #14 verified OPEN and unmerged at close.
