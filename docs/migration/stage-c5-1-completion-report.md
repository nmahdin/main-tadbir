# Stage C5-1 Completion Report — Versioned Plan Catalog, Module Entitlements & Resource Limits

Status: **implemented, CI-green, pending explicit human acceptance** (not approved). PR #14 remains OPEN and unmerged; nothing was merged to `main`; no production system was touched. Report items 1–10 per the C5-1 assignment.

## 1. Starting and final HEAD

- Starting HEAD: `30e60f2` (C4-3 final; the sandbox had restored stale git state, which was detected and realigned to the verified remote HEAD before editing).
- Final HEAD: the closing commit of this stage on `arena/582a70e5-main-tadbir` (pushed and verified equal to the PR head).

## 2. Files created and modified

Created:
- `backend/database/migrations/2026_10_15_000010_create_plan_catalog_tables.php`
- `backend/app/Core/Plans/PlanProvisioningException.php` (stable codes: `plan_key_invalid`, `plan_audience_invalid`, `plan_drift`, `plan_status_invalid`, `plan_version_invalid`, `plan_version_drift`, `plan_version_immutable`, `plan_version_not_found`, `plan_not_found`, `unknown_module`, `unknown_resource_key`, `limit_invalid`)
- `backend/app/Core/Plans/CorePlan.php`, `CorePlanVersion.php`, `PlanModuleEntitlement.php`, `PlanLimit.php`
- `backend/app/Core/Plans/PlanResourceCatalog.php`, `PlanVersionSnapshot.php`, `PlanProvisioner.php`
- `backend/app/Core/Plans/ModuleAccessLevel.php`, `Contracts/SubscriptionAccessEvaluator.php` (C5-3 contract, contract-only)
- `backend/tests/Feature/Core/PlanCatalogTest.php`, `PlanSchemaMysqlTest.php`
- `docs/migration/stage-c5-1-completion-report.md`

Modified:
- `.github/workflows/quality.yml` — `PlanSchemaMysqlTest` added to the MySQL step (a temporary diagnostics variant was fully reverted; final diff contains only this addition).
- `docs/migration/stage-status.md` — C5-1 row.

No subscription or billing tables were created (not needed in C5-1 — no schema dependency demonstrated), and the C4 entitlement gate binding was not touched.

## 3. Final schema and constraint definitions

- `core_plans`: unsigned BIGINT PK, unique `key` (80), required `name`, `audience` (default `organization`), `status` (default `draft`), timestamps. MySQL CHECKs: `audience IN ('personal','organization')`, `status IN ('draft','active','retired')`.
- `core_plan_versions`: PK, `plan_id` FK → `core_plans` **RESTRICT**, `version` unsigned int, `grace_days` unsigned int **default 0**, nullable `published_at`, timestamps, unique `(plan_id, version)`. MySQL CHECK `version > 0`.
- `core_plan_module_entitlements`: `plan_version_id` FK **RESTRICT**, `module_id` FK → `core_modules` **RESTRICT**, `is_allowed` bool default false, **composite PK `(plan_version_id, module_id)`** (duplicates impossible at the database level).
- `core_plan_limits`: `plan_version_id` FK **RESTRICT**, `resource_key` (80), `limit_value` unsigned BIGINT, `is_unlimited` bool default false, **composite PK `(plan_version_id, resource_key)`**.

RESTRICT everywhere preserves contract history: a plan with versions, a version with content, or a referenced module cannot be deleted out from under recorded entitlements.

## 4. Published-version immutability approach

Domain-layer enforcement in three places: (a) `PlanProvisioner` refuses every write (`updateDraftGrace`, `setModuleEntitlement`, `setLimit`) against a published version with `plan_version_immutable`, and `createDraftVersion` with drifted grace on a published version raises `plan_version_drift`; (b) `CorePlanVersion` model events refuse changing `grace_days`/`version`/`plan_id` once `published_at` was originally set, and refuse deleting a published version; (c) `PlanModuleEntitlement`/`PlanLimit` model events refuse create/update/delete when the parent version is published. `CorePlan.key` is immutable once created (stable provisioning identity). Republication is a no-op preserving the original `published_at`. **Honest limitation:** these are application-level guards, not database-wide immutability — direct SQL can still mutate rows; nothing here claims otherwise. No trigger-based enforcement was added (out of scope).

## 5. Plan/resource registry and provisioning behavior

- `PlanProvisioner` is the only write path: `createPlan` (idempotent on identical attributes; `plan_drift` on differing name/audience), `setPlanStatus` (draft→active→retired; retired final), `createDraftVersion` (default grace 0; drift rejected, explicit `updateDraftGrace` is the sanctioned draft change), `setModuleEntitlement` (registered modules only), `setLimit` (known resource keys only, nonnegative values), `publish` (once, idempotent), plus read-only `snapshot`/`latestPublished` returning `PlanVersionSnapshot` (entitlement map module→bool; limits map resource→{value, unlimited}; absent entitlement = not decided = read as not allowed).
- `PlanResourceCatalog` is the canonical resource-key registry, grounded in the approved C5 roadmap's member/workspace/storage quota dimensions: `workspaces`, `organization_members`, `workspace_members`, `storage_bytes`. It defines dimension names only — **no commercial tiers, prices, or values were invented**; every number enters via explicit provisioning calls.
- Provisioning has **zero side effects** (test-asserted): no subscriptions created (none can exist yet), no workspace module activation, no RBAC grants.

## 6. Grace-period schema behavior

`grace_days` is an unsigned integer **defaulting to exactly 0** (approved default grace period: 0 days), set per plan version at provisioning; negative values are rejected (`plan_version_invalid`); once published, the value is frozen with the rest of the version. Each published version may carry its own value (approved decision 5). Runtime grace evaluation is C5-2/C5-3 work; C5-1 only guarantees the stored contract.

## 7. Tests executed and actual results

`PlanCatalogTest` (SQLite, 6 tests, all passing):
1. Audiences/statuses valid; unique keys; identical re-provisioning is a no-op; attribute drift, invalid audience, malformed key rejected; status machine enforced (retired final).
2. Version numbers unique per plan (same number on another plan is independent); **default grace exactly 0**; explicit grace override stored; drifted re-creation rejected while drafts update only via the explicit path; version 0 and negative grace rejected.
3. Draft entitlement/limit editing incl. in-place overwrite (no duplicates); snapshot correctness; **zero (hard zero) vs unlimited distinction stored distinctly**; unknown module / unknown resource key / negative limit rejected; canonical resource key list asserted.
4. Published immutability through every path (provisioner writes, direct model mutation of `grace_days`, entitlement creation against a published version, published-version deletion) + republish no-op preserving `published_at`.
5. Composite PKs reject duplicate entitlement/limit inserts at the database level (`QueryException`).
6. No-side-effects: workspace module count 0, RBAC role count unchanged, and the production gate is still `UnavailableModuleEntitlementGate` returning false for a plan-allowed module — **a plan allowance grants nothing by itself**.

Full C1–C4 regression suites (SQLite backend job) pass unchanged; frontend gates pass.

## 8. MySQL findings and CI links

`PlanSchemaMysqlTest` (wired into the CI MySQL step) proves on InnoDB with committed postconditions: CHECK rejection of bad audience and `version = 0`, composite-PK duplicate rejection, RESTRICT rejection when deleting a plan with versions and when deleting a referenced module, and provisioned content intact with `grace_days = 0`. Final CI (HEAD of this stage):
- Push run `39021982558` — SUCCESS (Backend contracts and tests; Backend migration gate on MySQL; Frontend typecheck, tests and artifact).
- Pull-request run `39021985692` — SUCCESS (same three jobs).
(The closing documentation commit's runs are confirmed in the delivery summary.)

## 9. Remaining C5-2 / C5-3 integration requirements

- **C5-2:** subscription ownership (organization-owned for org workspaces, personal for personal workspaces), lifecycle (platform-admin activation/renewal, no payment gateway in MVP), expiry + grace computation feeding `ModuleAccessLevel`; organization suspension/termination must override subscription outcomes (C3); plan changes/downgrades with impact preview + explicit confirmation (C5-4 per roadmap sequencing).
- **C5-3:** implement `SubscriptionAccessEvaluator`, rewire the C4 `ModuleEntitlementGate` to real entitlement evaluation with activation eligibility kept separate from runtime read/write eligibility, enforce limited read-only access after expiry (data preserved, disabled modules stay inaccessible), and retire the Projects pilot gates (Stage 04B contract).
- Stored-contract notes for C5-3: read entitlements via `PlanProvisioner::latestPublished()` snapshots; absence of a module row on the published version = not allowed; `limit_value=0 & is_unlimited=false` is a hard zero.

## 10. Commit/push confirmation and PR status

Stage commits (`C5-1: …`, plus fully-reverted TEMP diagnostics) are pushed to `arena/582a70e5-main-tadbir`; **PR #14 remains OPEN and unmerged**, verified at close. **Code Complete: YES (C5-1). Security Verified: within dev/CI evidence. Development/CI Ready: YES. Production Operationally Ready: NO** (subscriptions/entitlement evaluation intentionally deferred to C5-2/C5-3; production environment unverified).

**Stopping after C5-1.**
