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

STOP — Stage 04A complete. Awaiting explicit approval. Do not proceed.
