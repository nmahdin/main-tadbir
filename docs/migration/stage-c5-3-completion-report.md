# Stage C5-3 Completion Report — Subscription Entitlement Evaluation, C4 Integration & Expired Read-Only Enforcement

Status: **implemented, CI-green, pending explicit human acceptance** (not approved). PR #14 remains OPEN and unmerged; nothing was merged to `main`; no production system was touched.

## 1. Starting and final HEAD

- Starting HEAD: `5c9e7da` (C5-2 final, verified equal to remote, clean worktree).
- Final HEAD: the closing commit of this stage on `arena/582a70e5-main-tadbir`.

## 2. Files created and modified

Created:
- `backend/app/Core/Subscriptions/SubscriptionEntitlementEvaluator.php` — the production evaluator.
- `backend/app/Core/Modules/ModuleOperation.php` — Read/Write/Execute operation classes.
- `backend/tests/Feature/Core/SubscriptionEntitlementEvaluatorTest.php` (7 tests), `backend/tests/Feature/Projects/ProjectsSubscriptionAccessTest.php` (2), `backend/tests/Feature/Core/EntitlementConcurrencyMysqlTest.php` (1).
- `docs/migration/stage-c5-3-completion-report.md`.

Modified:
- `backend/app/Core/Modules/ModuleServiceProvider.php` — production DI bindings (below).
- `backend/app/Core/Modules/ModuleAccessGuard.php` — operation-aware entitlement step.
- `backend/app/Core/Modules/ModuleAccessDeniedException.php` — new `module_read_only` code.
- `backend/app/Core/Modules/ModuleActivationPlanner.php` — confirmation token fingerprints entitlement outcomes.
- `backend/app/Modules/Projects/ProjectAuthorizer.php` — production composition (below).
- `backend/tests/Feature/Projects/ProjectsWorkspacePilotTest.php` — retired-pilot fixtures/tests reworked onto real plans/subscriptions.
- `backend/tests/Feature/Core/ModuleActivationTest.php`, `WorkspaceModuleApiTest.php` — pilot-path tests on real subscriptions.
- `backend/tests/Feature/Core/ModuleRegistrySyncTest.php`, `PlanCatalogTest.php` — gate-binding contract updated to the real evaluator (denial behavior still asserted).
- `.github/workflows/quality.yml` — MySQL test list only (temporary diagnostics fully reverted).
- `docs/migration/stage-status.md` — C5-3 row.

Deleted:
- `backend/app/Modules/Projects/Pilot/{PilotGatePolicy,PilotModuleAvailabilityGate,PilotOrganizationPolicyGate,PilotSubscriptionEntitlementGate}.php`
- `backend/config/projects.php` (the `PROJECTS_WORKSPACE_PILOT` opt-in).

## 3. Evaluator and access-level contract

`SubscriptionEntitlementEvaluator` (owner resolved strictly from the persisted workspace row via `SubscriptionService::snapshotForWorkspace`; ambiguous ownership throws inside the resolver and is caught → Denied):

| Subscription state | Plan entitles module | Result |
|---|---|---|
| Active | yes | **Full** |
| Grace | yes | **Grace** |
| Expired | yes (last effective published version) + history evidence | **ReadOnly** |
| any | no / version missing | Denied |
| Missing / NotStarted / Invalid | — | Denied |

Unknown or technically unavailable modules deny before any subscription lookup. **History evidence is required for every positive level** (an expired row alone never earns ReadOnly): ≥1 recorded period, all period windows consistent, the latest period belonging to the assigned plan version, and at least one period genuinely commenced. A corrupt Active-looking row with no periods fails closed the same way. The evaluator never invents workspace activation (that stays the C4 guard's check) and never re-decides organization lifecycle (C3 context resolution outranks it). `canActivate()` = Full|Grace with entitlement; the C4 `ModuleEntitlementGate::isEntitled()` is defined as exactly `canActivate` (activation semantics — the planner only asks about newly enabled modules).

## 4. Production dependency-injection changes

`ModuleServiceProvider` now binds `ModuleEntitlementGate` → `SubscriptionEntitlementEvaluator` and `SubscriptionAccessEvaluator` → the same singleton. The evaluator denies whenever subscriptions are missing/ambiguous/corrupt — there is no permissive fallback. `UnavailableModuleEntitlementGate` remains in the codebase for explicit test/fallback use only and is no longer the production binding (the two C4-1/C5-1 contract tests that pinned the old class were updated to pin the new class + identical denial behavior).

## 5. Activation and read/write enforcement

- **Activation:** planner previews evaluate entitlements through the real gate; the confirmation token now fingerprints per-module entitlement outcomes, so a subscription assignment/renewal/expiry/entitlement change between preview and confirmation yields `module_activation_preview_stale` (409) exactly when it changes confirmed eligibility — and the service still re-evaluates everything in-transaction (active/grace + entitled only; expired/missing/invalid deny, dependency closure included). Atomicity and dependent-safe deactivation are unchanged; **renewals never auto-enable modules** (asserted).
- **Runtime:** `ModuleAccessGuard::assertOperational(context, module, operation)` — after availability → organization-policy-deny → workspace-activation checks (all of which keep precedence: a disabled module denies even ReadOnly reads) — applies the subscription level: Full/Grace allow everything; ReadOnly allows `ModuleOperation::Read` only (Write/Execute → 403 `module_read_only`); Denied → 403 `entitlement_missing`. Operation safety is classified by operation semantics, never by HTTP method.

## 6. Projects pilot migration and removed bypasses

The Stage 04B pilot is retired: `ProjectAuthorizer` (still the single entry point for every Projects HTTP path — list/detail/create/update/delete, tasks, content plans, operations, restore) now composes the container `AuthorizationService` **without module gates** plus the operation-aware guard: `projects.view` → Read, create/edit/delete → Write. Deleted: all four `Pilot/*` gate classes and the `PROJECTS_WORKSPACE_PILOT` config (production/non-production pilot distinctions are gone with them). The three pilot-policy tests were replaced by a missing-entitlement denial test; every remaining pilot test now runs on **real published plan + subscription fixtures** (no entitlement doubles on operational paths). Mutation-boundary discipline: every request re-authorizes immediately before the write, so an entitlement change lands on the next operation without holding locks across requests; under transactional writes (module activation vs renewal), the shared owner/workspace row lock serializes competitors (MySQL-proven below). **Residual limitation (documented, unchanged from C3-3):** per-call context snapshots — a decision made at request start is not retroactively revoked mid-request.

## 7. Expiry, grace and renewal boundary results

Exact UTC boundaries verified at evaluator and HTTP levels: immediately before expiry → Full; exactly at expiry → Grace; mid-grace → Grace (full reads+writes); immediately before grace end → Grace; exactly at grace end → ReadOnly (GET list/detail 200; POST/PATCH/DELETE 403, `Matrix 3` record intact); zero-day grace was already covered in C5-2. Expired + disabled module → no reads at all. Suspended organization → 403 on reads and writes despite an active subscription, record preserved. Renewal (explicit non-past restart) restores PATCH 200 **without re-enabling anything and without replaying anything** — previously denied writes stay denied in history; no jobs exist to replay and none were replayed by design (C5-2 rule 10 preserved).

## 8. MySQL concurrency findings and remaining limitations

`EntitlementConcurrencyMysqlTest` (InnoDB, committed postconditions): a competing renewal that moves expiry into the past holds the workspace/owner row; the concurrent `WorkspaceModuleService::activate` blocks (1205); after the renewal commits, the activation re-evaluates at the boundary and is denied (`module_activation_preview_stale`/`entitlement_missing`) with **zero** `workspace_modules` rows committed. Remaining limitations: (a) per-call snapshots as above; (b) the evaluator reads subscription + period state per call (no caching) — correct over fast; (c) multi-module atomic *enablement* of an entitled closure is still exercised via all-or-nothing rejection, because the catalog implements only `projects`; (d) application-level history-evidence checks are evaluator-enforced, while direct-SQL writers could fabricate rows — such rows fail the consistency/commencement checks when internally inconsistent, but a fully self-consistent fabrication is indistinguishable from genuine provisioning (same trust boundary as C5-2, stated honestly).

## 9. Full CI links

- Code-complete runs (HEAD `dec7f21`): push `39025771562` — SUCCESS; pull-request `39025775890` — SUCCESS (Backend contracts and tests; Backend migration gate on MySQL incl. all concurrency suites; Frontend typecheck, tests and artifact).
- Closing documentation runs are confirmed in the delivery summary.

## 10. PR #14 status

OPEN and unmerged at the stage's final HEAD (verified at close).

**Readiness:** Code Complete YES (C5-3; the entitlement chain C4→C5 is now functional end-to-end in dev/CI) · Security Verified within dev/CI evidence · Development/CI Ready YES · Production Operationally Ready NO (production environment unverified; Bootstrap/Recovery blockers from earlier stages stand; no deployment performed or implied). Next: C5-4 (subscription administration APIs + plan-change preview/confirmation) when authorized. **Stopping after C5-3.**
