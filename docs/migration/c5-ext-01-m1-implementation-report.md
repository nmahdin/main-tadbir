# C5-EXT-01 — Milestone M1 Implementation Report

**Milestone:** M1 — Free-Plan Foundation and AUTH Provisioning Unblock
**Authorization:** human approval 2026-10-20 (M1 only; M2–M6 NOT authorized)
**Specification:** `docs/architecture/spec-c5-ext-01-plans-subscriptions-checkout-billing.md` (§15 resolved)
**Decisions:** `docs/adr/0022-c5-ext-01-final-decisions.md` (ACCEPTED; AMB-C5-01=B integer Toman, AMB-C5-03=B automatic Organization Free, 02/04/05/06/07/08=A)
**Branch:** `arena/582a70e5-main-tadbir` — PR #14 remains OPEN and unmerged by instruction.

## 1. What M1 delivers

1. **Canonical Free plans, published idempotently** — `plans:provision-free`
   creates/publishes `personal-free` and `organization-free` v1 through the
   existing C5 `PlanProvisioner` (immutable published versions; re-running
   duplicates nothing and drifts nothing). Free limits:

   | Plan | Workspaces | Members | Active projects | Storage |
   |---|---|---|---|---|
   | `personal-free` v1 | 1 | 1 per workspace | 3 | 100 MB (104857600 B) |
   | `organization-free` v1 | 1 active | 3 org / 3 per workspace | 5 | 100 MB (published; org measurement unsupported — see §4) |

   Entitlements: only already-Available catalog modules (currently
   `projects`). No paid/admin capability is granted. Grace: 7 days where
   the lifecycle applies; Free requires no checkout and never expires
   into a payment demand.
2. **Trusted system activation path** — `FreePlanActivator` +
   `SubscriptionService::assignInitialFree` (Free-plan-key allowlist from
   `config/billing.php`, owner-type validation, system provenance in the
   audit trail). The human Platform Management path
   (`assignInitial`) is unchanged; there is NO user-facing
   system-activation endpoint. AUTH activation and organization creation
   delegate to the activator — no business rules duplicated in auth code.
3. **Recoverable pending state** — additive migration
   `2026_10_19_000003_c5_ext_01_m1_free_foundation` adds
   `free_activation_pending` (one marker per owner, unique `owner_key`,
   cascades with owner deletion). A missing published plan never fails
   registration/organization creation and never fakes success: the marker
   is recorded and `subscriptions:resume-pending-free` (with read-only
   `--dry-run` preflight/report) completes activation later, resolving
   markers without duplicating workspaces or subscriptions. Legacy
   organizations without subscriptions are NEVER mass-assigned (the
   resume command only processes recorded pendings and personal owners
   holding the explicit pending state).
4. **Automatic Organization Free (AMB-C5-03=B)** — `OrganizationProvisioner`
   activates Organization Free for eligible newly created organizations
   in the same provisioning flow; existing/valid/paid subscriptions are
   never replaced or downgraded (classified conflicts, skipped loudly in
   command reports).
5. **AUTH unblock** — `AccountActivationService` delegates Personal Free
   activation to the activator; pending accounts resume without a
   duplicate workspace (`subscriptions:resume-pending-free` also covers
   personal owners recorded pending before publication).
6. **Real quota enforcement** — `ResourceLimitGuard` wired at the true
   write paths, with Persian limit-reached responses (422) and unknown
   usage failing closed:

   | Resource | Measure | Guarded write paths |
   |---|---|---|
   | `projects` | ACTIVE only (status ∉ completed/cancelled/archived; archive state on `projects` is status-only) | project store; terminal→active reactivation |
   | `workspace_members` / `organization_members` | active memberships | invitation acceptance, only when a membership is actually CREATED |
   | `workspaces` | personal workspace count | additional personal workspace creation |
   | `storage_bytes` | SUM(`dam_files.file_size`) over assets owned by the personal-workspace owner | DAM upload/revision (personal owners) |

7. **Minimal honest UI** — `GET core/personal/dashboard-summary`
   (owner-only by construction) + `pending_free_activation` on the
   organization summary; `PersonalSubscriptionCard` in the personal
   workspace dashboard shows loading / error / no-workspace / pending /
   missing / active states, limits with live usage bars, and an explicit
   at-limit note. No price, checkout, or payment UI exists. The
   organization dashboard distinguishes pending-Free from legacy
   no-subscription guidance.

## 2. Decision → service/API → schema → UI → permission → test traceability

| Decision | Service/API | Schema | UI | Permission/provenance | Tests |
|---|---|---|---|---|---|
| AMB-C5-01=B (integer Toman) | `config/billing.php` documents denomination + provider conversion boundary; NO money fields created in M1 | none (legacy audit §3) | no prices shown anywhere | n/a | config gate in `c5ext01m1.test.mjs`; legacy audit in report |
| AMB-C5-03=B | `FreePlanActivator`, `assignInitialFree`, `OrganizationProvisioner` delegation | `free_activation_pending` | org dashboard pending-vs-legacy copy | org creation (existing), activator validates owner identity; never replaces existing | backend M1 tests 5–7, 9 |
| Free publication | `plans:provision-free` (audited, idempotent) | C5-1 plan/version tables (unchanged) | none (operator command) | operator-only Artisan; published versions immutable | M1 test 1 |
| AUTH unblock | `AccountActivationService` delegation; `subscriptions:resume-pending-free` | pending markers | personal card pending state | system provenance + correlation audit; no user endpoint | M1 tests 4, 8, 9 |
| Quotas | `ResourceLimitGuard`, `CoreResourceUsageReader` (`projects` measure) | none | personal card bars + at-limit note | owner-scoped; fail-closed on unknown usage | M1 tests 7, 10; existing suites green |
| Storage honesty | personal-only measurement | none | storage bar (personal only) | owner identity required | M1 test 7 (measurement + cap) |

## 3. Legacy-money audit (AMB-C5-01=B)

The pre-M1 codebase contains **no monetary columns at all**: the only
currency-adjacent field is free-text `projects.budget` (a display string,
never parsed as money). Therefore M1 has nothing to reinterpret or
migrate. Going forward (M2+, separate authorization): canonical internal
money is integer Iranian **Toman**; conversion to provider denominations
(e.g. rial) happens only at the provider adapter boundary, explicitly,
never silently. No prices, orders, or payments exist in M1.

## 4. Storage honesty statement

The only byte-accurate storage source is `dam_files.file_size`. DAM
assets are user-owned with no workspace/organization link, so in M1
storage measurement/enforcement is genuinely supported **only for
personal owners**. For organizations usage reports `null` (unknown) and
no storage enforcement is claimed; the published 100 MB organization
limit becomes enforceable only when assets gain an organization context
(future milestone). Task attachments store size as free text and are
unsupported. Above-limit and legacy data is never deleted or hidden:
reads remain available; only new writes are constrained.

## 5. Operator commands (exact)

```bash
# BEFORE any command: complete the Laragon preflight (§6).
cd backend

# 1) Publish/verify the canonical Free plans (idempotent; safe to re-run)
php artisan plans:provision-free --dry-run   # report only
php artisan plans:provision-free             # publish personal-free + organization-free v1

# 2) Resume accounts/organizations recorded pending (after publication)
php artisan subscriptions:resume-pending-free --dry-run   # counts + reasons, no writes
php artisan subscriptions:resume-pending-free             # activate + resolve markers
```

Expected resume outcomes per owner: `activated`, `existing` (already
subscribed — untouched), `conflict` (legitimate non-Free subscription —
never overwritten), `pending` (plan still missing), `invalid`
(identity mismatch — investigated manually). Counts and reasons are
printed; no sensitive data is logged.

## 6. Windows/Laragon preflight + backup checklist (operator)

1. Laragon started; confirm PHP ≥ 8.2 + required extensions, MySQL/MariaDB running; identify the target DB (`tadbir`) — do NOT point commands at any other database.
2. Backup first: export a full SQL dump of `tadbir` (e.g. Laragon → Database → Export, or `mysqldump`) and store it outside the project with a dated name. Verify the dump file is non-empty.
3. `git status` clean on the reviewed commit; `composer install` if `vendor/` is stale; `php artisan migrate:status` reviewed (only additive migrations pending; M1 adds `2026_10_19_000003`).
4. Run `plans:provision-free --dry-run`, read the report, then run it for real; re-run `migrate:status`.
5. Run `subscriptions:resume-pending-free --dry-run`; review counts; then run for real.
6. Never run `migrate:fresh`, `db:wipe`, or destructive rollbacks against `tadbir`. Recovery = restore the §6.2 dump.
7. Verify in the UI: sign in → personal dashboard shows the Free card (active state); create a 4th project → Persian limit message; existing data still visible.

## 7. Verification evidence

- Backend (CI, sqlite): full suite incl. `C5Ext01M1FreeFoundationTest`
  (10 tests) green; Pint clean; architecture contracts green.
- MySQL 8 + MariaDB 10.11 migration gates and MariaDB 10.4 legacy
  timestamp gate: green (M1 migration runs clean under
  `explicit_defaults_for_timestamp=OFF`; pending markers cascade).
- Frontend: `npm test` (incl. `c5ext01m1.test.mjs` gates), `tsc`, and the
  production build green in CI.
- Visual evidence (mocked API, production build, 1440px):
  `docs/evidence/c5-ext-01-m1/personal-free-active-1440.png`,
  `personal-free-pending-1440.png`, `personal-free-limit-1440.png`.
- Real-route verification steps (operator, after §6): open `/dashboard`
  in the personal environment → «اشتراک شخصی» card; switch to an
  organization created before publication → pending guidance; create
  projects up to the cap → next creation returns the Persian limit
  message while all existing projects remain listed.

## 8. Mandated-test coverage map

Publication idempotency + immutability ✓ · exact Free limits ✓ ·
system-only activation (no user endpoint; platform path unchanged) ✓ ·
no privilege escalation (owner-type/provenance validation) ✓ · initial
Personal Free ✓ · pending recovery without duplicate workspace ✓ ·
auto Org Free ✓ · duplicate/concurrent activation attempts (sequential
proof + engine unique/lock backstop; real concurrency exercised by the
C5 MySQL suites) ✓ · paid/valid subscription preservation ✓ · missing
plan/conflict handling ✓ · project quota (create + reactivate) ✓ ·
member + workspace limits ✓ · storage measurement + applicable
(personal) enforcement ✓ · above-limit read-only ✓ · AUTH/invitation/
context regression = full existing suites green ✓ · MariaDB 10.4 legacy
timestamp compatibility ✓ (CI gate).

## 9. Taxonomy

- **Implemented + tested (CI):** everything in §1.
- **Implemented, operator-dependent:** publication + resume on the real
  Laragon database (§5/§6) — not executed by the agent on real data.
- **Blocked:** nothing in M1 scope.
- **Deferred (NOT authorized, unimplemented):** M2 paid plans/pricing,
  M3 checkout/orders/gateways, M4 discounts/taxes, M5 invoices/PDF/
  refunds, M6 lifecycle automation/self-service billing; organization
  storage enforcement (needs asset→organization context).
- **Security verification:** no independent scan performed for M1; the
  previously open scan item remains a merge prerequisite. No new
  user-facing write endpoints were added (one owner-only read endpoint).

## 10. Readiness

- **Code Complete (M1):** YES.
- **Dev-CI Ready:** YES — all five quality gates green on the final commit.
- **Security Verified:** NO (independent scan outstanding, as before).
- **Production Ready:** NO — operator publication/resume (§5) not yet run
  on real data; PR #14 unmerged by instruction; ARCH-02 acceptance open.

**STOP:** awaiting human acceptance of M1. M2–M6 remain unimplemented
and unauthorized.
