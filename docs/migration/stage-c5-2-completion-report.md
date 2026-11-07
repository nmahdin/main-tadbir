# Stage C5-2 Completion Report — Subscription Ownership, Lifecycle, Grace Period & Manual Renewal

Status: **implemented, CI-green, pending explicit human acceptance** (not approved). PR #14 remains OPEN and unmerged; nothing was merged to `main`; no production system was touched.

## 1. Starting and final HEAD

- Starting HEAD: `2aaa854` (C5-1 final, verified equal to remote, clean worktree).
- Final HEAD: the closing commit of this stage on `arena/582a70e5-main-tadbir`.

## 2. Schema and database invariants

Migration `2026_10_15_000011_create_subscription_tables.php`:

- `core_subscriptions`: PK; `organization_id` (nullable FK) XOR `personal_workspace_id` (nullable FK), both RESTRICT; `plan_version_id` FK → `core_plan_versions` RESTRICT (always the last valid published plan, preserved after expiry); UTC `starts_at`/`expires_at`/`grace_ends_at`; optimistic `status_version` (default 1); `created_by_user_id`/`updated_by_user_id` (nullOnDelete); timestamps. Owner XOR is a MySQL CHECK plus a `creating` model guard for SQLite parity.
- **One-current-subscription guarantee is database-backed:** a generated stored `owner_key` (`'org:{id}'` / `'ws:{id}'`, dialect-appropriate expression for MySQL/SQLite) under a **unique index**. A nullable composite unique was deliberately avoided — MySQL treats NULLs as distinct and would permit duplicate org-owned (or workspace-owned) subscriptions. This is the same generated-column machinery as `platform_role_assignments.active_user_id` from C2-1 (and avoids the generated-column+CASCADE pitfall of 03A: all FKs here RESTRICT).
- `core_subscription_periods`: PK; `subscription_id` + `plan_version_id` RESTRICT FKs; `operation` (`initial|renewal`, MySQL CHECK); `effective_starts_at`/`expires_at`/`grace_ends_at`; mandatory `reason` (500); `correlation_id` with **unique `(subscription_id, correlation_id)`** (idempotency); authorized actor; timestamps. Model guards make periods immutable (no update/delete).
- **No `core_subscription_events` table:** lifecycle events are written to the established transactional C1 audit (`subscription.assigned` / `subscription.renewed`, same-transaction, audit failure rolls the mutation back — tested), so a domain events table would duplicate that record; period history carries the domain-specific payload.

## 3. Subscription owner resolution

`SubscriptionOwnerResolver` resolves ownership **only from persisted workspace records**: organization-owned workspace → its organization (after verifying the organization exists); personal workspace → itself. `subscriptionForPersonalWorkspace` rejects organization-owned workspaces (`subscription_owner_invalid`); `assertBelongsToWorkspace()` rejects a subscription whose owner key differs from the workspace's resolved owner key (`subscription_owner_mismatch`) — the same discipline as the C3 execution guard, for any code receiving subscription references from payloads. A personal workspace never borrows organization entitlements (tested with the same user holding both). Nothing trusts client/job-supplied ownership claims.

## 4. Lifecycle and renewal algorithms

`SubscriptionLifecycle::evaluate(subscription, now)` is a pure function of stored UTC boundaries (app timezone is UTC; `now` injectable): **Missing** (no row) and **Invalid** (expiry ≤ start, or grace-end < expiry) fail closed; **NotStarted** before start; **Active** start-inclusive → expiry-exclusive; **Grace** expiry-inclusive → grace-end-exclusive; **Expired** at/after grace-end. No scheduled command rewrites stored status. Exact boundaries are test-asserted at one-second granularity (before/at expiry, before/at grace-end), including **zero-day grace** (expiry instant is already `Expired`).

**Renewal (deterministic):** while Active/NotStarted, the new period extends from the current expiration boundary (a conflicting supplied start is `subscription_period_invalid`); during Grace/Expired the operator must supply an explicit start that is not in the past (past entitlement is never fabricated) and does not overlap the previous paid window; new expiry must exceed the period start; new grace end = new expiry + the assigned published version's `grace_days`. Plan changes are rejected by construction (renew never accepts a plan; `subscription_plan_change_unsupported` is reserved and plan-change preview/confirmation is C5-4). Retries with the same `correlation_id` return the recorded outcome (no duplicate period, no version bump); `status_version` optimistic checks raise `subscription_stale_version`. `snapshotForWorkspace()` returns state + the **last valid published plan snapshot** (via C5-1 `PlanProvisioner`), so C5-3 can evaluate previously-entitled read access after expiry — while Missing/NotStarted/Invalid snapshots carry no plan entitlement.

Lock order (documented): **owner row → subscription row**, both `FOR UPDATE`, re-read under lock; platform authorization is checked before the transaction and state is never trusted from before it.

## 5. Permission/provisioning changes

- New platform catalog key **`platform.subscriptions.manage`** (9 → 10 platform keys).
- The protected Primary Administrator receives it **only** through the reviewed `PlatformRoleProvisioner` upgrade path, extended from the C3-2 pattern: frozen C2 (6-key) and C3-2 (9-key) sets both upgrade exactly to the approved 10-key set when `ensurePrimaryAdministrator()` runs; any other drift still throws `PlatformProvisioningException`. **Catalog synchronization alone grants nothing** (existing C2 contract tests were updated only to absorb the approved key/set — no behavior weakened).
- Mutations evaluate `PlatformAuthorizer::allows(actor, 'platform.subscriptions.manage')` against persisted assignments. Organization/workspace managers and suspended platform administrators are denied (tested). Organization owners, Legacy Admin, and Primary-status-as-label confer nothing.
- Subscriptions are **never created automatically** (organization/workspace creation produces none — tested), never enable modules, never grant RBAC, never delete data, never replay operations (all test-asserted/no-op by construction).

## 6. Tests and MySQL concurrency results

`SubscriptionLifecycleTest` (SQLite, 9 tests): org + personal assignment and resolution; cross-scope claim and invalid-owner rejection; audience mismatch, unpublished/draft plan, inverted window, blank reason fail-closed (zero rows survive); duplicate assignment vs idempotent retry; exact UTC boundary matrix; zero-grace; invalid-state denial; renewal extension/idempotency/stale-version/period-immutability with audit presence; post-expiry explicit restart (missing/past start rejected) with the preserved plan snapshot; platform-permission matrix (workspace manager, suspended admin denied); audit-failure rollback with zero side effects (`WorkspaceModule` and RBAC role counts unchanged).

`SubscriptionConcurrencyMysqlTest` (CI-wired, 3 tests, committed postconditions): competing first assignments block on the owner row lock (1205) and serialize to **exactly one subscription + one period** with the late assignment rejected `subscription_exists`; concurrent renewals serialize, the blocked loser then hits `subscription_stale_version` against the winner's committed version bump and succeeds with the fresh version — exactly one renewal period for its correlation; independent owners never block each other. Fresh MySQL migration gate and the full C1–C5-1 + frontend suites pass.

## 7. CI links

- Code-complete runs (HEAD `0585fdb`): push `39023868185` — SUCCESS; pull-request `39023871499` — SUCCESS (Backend contracts and tests; Backend migration gate on MySQL; Frontend typecheck, tests and artifact).
- Closing documentation runs are confirmed in the delivery summary.

## 8. Known limitations and C5-3 handoff

- Application-level guards (owner XOR on SQLite, period immutability, renewal overlap rules) are enforced in services/models; the **one-subscription-per-owner guarantee is additionally database-backed** (owner_key unique), while overlap prevention relies on the documented lock order — honestly, an unserialized direct-SQL writer could still insert a bad row; evaluators fail closed on invalid stored windows.
- Lifecycle evaluation is per-call, not a materialized status — consumers must evaluate at the decision instant (same per-call discipline as C3-3).
- The C4 `UnavailableModuleEntitlementGate` is **unchanged**; plan/subscription data grants nothing at runtime yet. Projects pilot behavior is untouched (temporary diagnostics commits during this stage were fully reverted; the only workflow delta is the added MySQL test file).
- **C5-3 handoff:** implement `SubscriptionAccessEvaluator` (C5-1 contract) over `SubscriptionService::snapshotForWorkspace()`: Full/Grace → full, Expired-with-prior-entitlement → limited read-only (enabled modules only; disabled stays inaccessible), everything else denied; organization suspension/termination overrides subscription outcomes (C3); keep activation eligibility (`canActivate`) separate from runtime read/write; then rewire the C4 gate and retire the Projects pilot gates (04B contract). C5-4 owns administration APIs and plan-change preview/confirmation.

**Readiness:** Code Complete YES (C5-2) · Security Verified within dev/CI evidence · Development/CI Ready YES · Production Operationally Ready NO (entitlement *enforcement* lands in C5-3; production environment unverified).

## 9. PR #14 status

OPEN and unmerged at the stage's final HEAD (verified at close). **Stopping after C5-2.**
