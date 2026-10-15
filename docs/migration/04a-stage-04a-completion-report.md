# TADBIR Migration — Stage 04A Completion Report (Central Authorization Engine and Workspace Context)

- **Stage:** 04A only · **Status:** NEEDS REVIEW · **Baseline:** Stage 03B approval `6ff2768` · Branch: `arena/582a70e5-main-tadbir` (Arena limitation)
- **Not done (by design):** Stage 04B pilot migration, switching Projects or any business module, legacy role/department/team deletion, subscriptions/billing, production connection, merges, frontend/Design System changes.

## 1. Implementation

| Area | Files |
|---|---|
| Central decision | `app/Core/Authorization/AuthorizationService.php` (authorize / resolveContext / assertPermission / can), `WorkspaceContextResolver.php`, `WorkspaceContext.php` |
| Failure taxonomy | `AuthorizationException` (base, reason code + HTTP status), `AuthorizationDeniedException` (403), `InvalidAuthorizationContextException` (404), `RetryableAuthorizationException` (503), `ConcurrencyErrors` (1205/1213/40001/SQLite-busy classifier) |
| Gate contracts | `Contracts/{ModuleAvailabilityGate,OrganizationPolicyGate,SubscriptionEntitlementGate}.php`, `GateDecision` (allowed/denied/unavailable), default `Unimplemented*Gate` implementations (fail closed) |
| Scoping contracts | `WorkspaceScope` (query constraint + direct/nested record assertions), `Contracts/WorkspaceOwned`, `ScopesToWorkspace` trait |
| Tests | `tests/Feature/Core/CoreAuthorizationTest.php` — 16 tests + 7-case identifier data provider |
| Docs | `docs/architecture/central-authorization.md` (decision flow, gates, failure taxonomy, adoption contract) |

No schema changes in this stage (the 03A/03B schema suffices); no controller, route, legacy model, or frontend file was modified.

## 2. Rules implemented (core.md §2.1, ADR-0008)

- **Trusted context, never client-trusted:** authorization evaluates, in order, platform-active account (user re-read from the database, matching `EnsureActiveAccount`), workspace existence/activity, ACTIVE workspace membership, ACTIVE organization membership for organizational workspaces, then the membership role's catalog permission. A supplied workspace ID is only a lookup key; malformed/missing identifiers are 404 invalid-context.
- **Fail-closed gates:** module operations (`moduleId` given) require module-availability, organization-policy, and subscription-entitlement gates to affirmatively allow. All three are contracts with deliberately *unavailable* defaults — permission alone can never authorize a module operation, and no paid-module behavior is enabled by placeholder (subscriptions Q-01 and module activation remain unimplemented, as instructed).
- **No implicit platform bypass:** identity (including any future platform admin) grants no context by itself (ADR-0003); the resolver has no bypass branch.
- **Fresh decisions:** contexts are resolved per call from current rows; role demotion and membership deactivation deny on the next decision (tested). Lock-contention failures classify as retryable 503s, never as grants.
- **Reusable without consumers:** the service layer depends only on Core + `App\Models\User` (Core independence kept; architecture tests pass unchanged) and is directly callable from tests/console-style code today; HTTP/Bale/Google adoption is deferred per-module (legacy checks remain authoritative until each module's tested cutover, ADR-0008 §4 coexistence).

## 3. Test evidence (actual runs)

Backend PHPUnit (SQLite, CI "Backend contracts and tests") covers: personal + organizational resolution; org-without-workspace and workspace-without-org membership denials; deactivated/ended membership denial; deactivated organization membership blocking; inactive user/workspace; 7 invalid-identifier cases; cross-workspace and cross-organization denial; missing-permission denial; unknown and cross-scope key rejection (422); per-workspace context isolation for one user; query scoping, direct-ID (IDOR) and nested-record assertions (404 semantics); the `WorkspaceOwned` trait contract via a test double; unimplemented-gate fail-closed behavior; stub-gate allow/deny evaluation; re-resolution after demotion/deactivation; retryable-error classification. Development iterations: two of my own test defects were caught and fixed against CI evidence (factory in-memory `status` default — resolver now refreshes the user; a scoped-query expectation that forgot the creator's own membership). Final CI on the report head: Backend PASS (incl. scoped Pint), MySQL 8.0 migration gate PASS (no new migrations; concurrency suite from 03B still green), Frontend PASS, GitGuardian PASS — exact run URLs in the closing message. Local execution: NOT RUN (no PHP in sandbox; parser validation only).

## 4. Deferred / limitations

- No module consumes the engine yet (04B pilot); legacy authorization paths unchanged and unmeasured against the new decision until then.
- Gate implementations arrive with their owning stages (06 subscriptions — blocked on Q-01 — and 07 module activation); until then module operations always deny at the first gate. This is intentional, not a gap to paper over.
- Audit logging of authorization-sensitive changes (ADR-0008 §6) is not wired in 04A; no audit table was invented ahead of its design.
- Multi-request concurrency is covered by the 03B MySQL lock tests for membership/role mutation; the resolver reads current rows per call, which the demotion/deactivation tests prove sequentially. MariaDB NOT TESTED; production MySQL version UNKNOWN (Q-02).

## 5. Acceptance checklist — Stage 04A

- [x] Central authorization service + trusted workspace context resolver (no client-trusted IDs)
- [x] Gate contracts with fail-closed unimplemented behavior; no invented entitlement defaults
- [x] Query-scoping and record-ownership contracts (direct + nested, IDOR-safe semantics)
- [x] Consistent failure handling (403/404/503/422 taxonomy with stable reason codes)
- [x] Positive/negative security tests incl. concurrent-change re-resolution; SQLite + MySQL + frontend CI gates green
- [x] Core independent of business modules; legacy authorization untouched; no frontend/Design System changes; no merges
- [ ] Human approval before Stage 04B

## 6. Conditional-approval correction — current-membership resolution (2026-10-15)

**Finding (human review):** `WorkspaceContextResolver` selected both memberships with an unfiltered `first()`. Because rejoining after `ended` creates a *new* membership record (Stage 03A), the resolver could pick the ended historical record instead of the current one.

**Fix (commit recorded in the stage history following `4c916b0`):** both lookups now select the *current* membership — the single non-ended record per user and scope guaranteed by the Stage 03A generated live-key unique index (`where status != ended`, newest-first as a defensive tiebreak) — via one shared helper for `WorkspaceMembership` and `OrganizationMembership`. Failure semantics are preserved and sharpened: no membership ever → `*_missing`; only ended history → `*_inactive` ("has ended"); current record deactivated → `*_inactive`. Historical records can no longer override the current membership, and because `end()` cleared the old role (Stage 03B), nothing about this selection can restore historical roles or permissions.

**Audit of other Core membership lookups (requirement: review for the same problem):** `MembershipPermissions` (both resolvers) and `FinalManagerGuard`'s manager counts filter to `status = active`; `WorkspaceAccess`, `OrganizationController`, and `WorkspaceController` filter to active memberships; the role-deletion in-use check (`status != ended`) and `CoreRbacSeeder` (`whereIn [active, deactivated]`) deliberately operate on the non-ended set. The resolver was the only unfiltered selection — no other change was needed.

**Tests (4 added):** ended → rejoin-active and ended → rejoin-deactivated for **workspace** memberships, and the same pair for **organization** memberships. The active-rejoin tests endow the historical record with manager authority first and assert that after rejoining (a) resolution follows the *new* record's id, (b) workspace resolution succeeds while `workspace.roles.manage` is gone, and (c) organization permissions are exactly `['organization.view']` — i.e., no automatic restoration. The deactivated-rejoin tests assert denial while deactivated and successful resolution after reactivating the *new* record, proving the resolver tracks the current record rather than the ended one.

**Gate registration documentation:** `docs/architecture/central-authorization.md` §2.1 now documents exactly how the three gate implementations will be bound through Laravel's service container in their owning stages (provider `bind()` per gate; consumers must resolve `AuthorizationService` via the container; manual construction keeps failing closed), without implementing any entitlement behavior.

**Evidence:** correction head CI fully green — Backend (full PHPUnit incl. the 4 new tests, scoped Pint, architecture tests), MySQL 8.0 migration gate + 03B concurrency step, Frontend, GitGuardian; exact run URLs in the closing message. No schema change, no consumer migration, no database reset.

STOP — Stage 04A correction complete. Awaiting final human review. Do not proceed.
