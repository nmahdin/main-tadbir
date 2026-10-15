# Stage C1 completion report — identity normalization, account lifecycle, minimal audit

Status: implementation complete on PR #14 (branch
`arena/582a70e5-main-tadbir`). Scope A (identity) and Scope B
(audit foundation) as authorized. Nothing else was migrated.

## Behavior before → after

| Surface | Before | After |
|---|---|---|
| Status vocabulary | `active`, `inactive`, `blocked`, `pending` (string literals compared ad hoc; central funnel `User::isActive()`) | Same four legacy values with identical semantics, plus `suspended` and `deactivated`, interpreted centrally by `App\Core\Identity\AccountStatus`. `User::isActive()` delegates to it (only `active` grants access — unchanged). |
| New statuses reachable via | n/a | Only `POST /api/v1/users/{id}/account-lifecycle` (system admin or `users.status` holders). The legacy user form still accepts only the four legacy values — no silent activation/unblocking path was created. |
| Login (API password/token grant) | Non-active → 403 with per-status Farsi message | Unchanged for legacy statuses; `suspended`/`deactivated` get equivalent messages through the same `blockedMessage()` funnel. |
| Protected HTTP API | `EnsureActiveAccount` denies non-active per request (403) | Unchanged mechanism; suspended/deactivated now denied by it too. |
| Existing Sanctum tokens | Tokens of blocked/inactive users were already useless (middleware), token rows remained | On suspend/deactivate the token rows are **deleted** inside the transition transaction; the old bearer token returns 401. |
| Web (session) auth | Per-request `auth.account.active` middleware (`/app`) | Unchanged: a suspended user's next request is denied and logged out by the existing middleware. No session table surgery needed or performed. |
| Bale identity surfaces | `UserPermissionGate` used `isActive()` | Unchanged code; canonical interpretation now flows through it automatically. |
| Core authorization resolver | `account_inactive` denial for non-active | Unchanged; now covers suspended/deactivated (proven by test). |
| Memberships on suspend | n/a | **Preserved** (both Core memberships keep status/roles); access is denied by account status everywhere. Restore is therefore side-effect-free. |
| Memberships on deactivate | n/a | Every live workspace/organization membership is ended transactionally via the existing Stage 03B guarded `end()` (role cleared, `ended_at` stamped, historical row kept). |
| Account deletion | Not performed anywhere | Still never performed; historical records, ownership references and audit remain. |

Lifecycle rules (new, `Core\Identity\AccountLifecycle`):
suspend ∈ {active, inactive, blocked} → suspended; restore:
suspended → active only; deactivate: any non-deactivated status →
deactivated (terminal). All other transitions rejected with
`AccountLifecycleException` → HTTP 422. Self-targeting is not
specially blocked in v1 (an admin can suspend/deactivate their own
account if authorized — flagged below as a limitation).

## Schema changes (both additive, reversible)

1. `2026_10_15_000004_extend_user_account_statuses` — widens
   `users.status` ENUM/CHECK from four to six values
   (`->enum(...)->change()`, same approach as Stage 02.5's
   `projects.status` widening; MySQL ENUM and SQLite CHECK rebuilt by
   Doctrine). No data rewritten. `down()` intentionally does not
   narrow (would destroy suspended/deactivated accounts); documented
   in the migration. Legacy MySQL data unaffected (no row changes).
2. `2026_10_15_000005_create_audit_logs_table` — new `audit_logs`
   table: `id`, nullable `actor_user_id` FK (`nullOnDelete` — the
   audit trail outlives actor accounts), `action`, `scope_type`,
   `scope_id`, `target_type`, `target_id`, `summary` JSON (masked),
   `ip_address`, `user_agent`, `created_at` only (no `updated_at`).
   Indexes on (target_type,target_id), (scope_type,scope_id),
   (actor_user_id), (action), (created_at). `down()` drops the table.

## Audit guarantees (Scope B)

- `App\Core\Audit\AuditWriter::record()` is called **inside** the
  mutation's transaction (identity transitions, legacy status changes
  through user administration): audit and mutation commit or roll
  back together — proven by the final-manager rollback test (no
  `identity.account_deactivated` row survives a rejected transition).
- Sensitive keys (`password`, `token`, `secret`, `authorization`,
  `api_key`, `otp`, `credential`, any key containing them) are
  recursively masked to `***` before persistence; tested with nested
  payloads.
- `AuditLog` is append-only at the model layer: `update()`/`delete()`
  throw `LogicException`; the table has no `updated_at`.
- Audit is Core-internal security/compliance data; it is distinct
  from the user-facing Activity Log (untouched, out of scope).

## Membership & final-manager safeguards

Deactivation reuses `WorkspaceMembership::end()` /
`OrganizationMembership::end()`, which run the Stage 03B
scope-container-row lock + FinalManagerGuard. If the user is the
final manager of any organization or workspace, the guard throws,
the **entire** deactivation rolls back (status, tokens, memberships,
audit) and the endpoint returns 422. Successor-manager-first is the
required operator flow; C1 never orphans a scope and never bypasses
the guard.

## Files

New: `app/Core/Identity/{AccountStatus, AccountLifecycle,
AccountLifecycleException}.php`, `app/Core/Audit/{AuditLog,
AuditWriter}.php`, `app/Http/Controllers/Api/V1/Core/
AccountLifecycleController.php`, the two migrations,
`tests/Feature/Core/CoreIdentityAuditTest.php`, this report.
Touched (minimal, semantics-preserving): `app/Models/User.php`
(`isActive()` delegates), `AuthController` (two new login messages),
`UserController` (audit on legacy status change, inside its existing
transaction), `routes/api.php` (one additive route),
`docs/migration/stage-status.md`.

## Verification

`CoreIdentityAuditTest` (9 tests): legacy semantics/login denial
without silent activation; valid + invalid transitions; terminal
deactivation; token revocation (real Sanctum token → 401) +
resolver `account_inactive`; endpoint authority (403 without
`users.status`); transactional membership ending with history
preserved; final-manager deactivation rollback incl. audit absence;
audit rows for all three actions; audit on legacy status change;
masking + immutability; two-workspace isolation; suspension ends
nothing. Existing Stage 03A/03B/04A/04B suites run unmodified as
regression. Full CI (backend PHPUnit, MySQL migration gate — the
`->change()` widening is exercised there — frontend) green; final
run links are recorded in the stage handoff.

## Known limitations / not in C1

- No admin UI for audit viewing (C10 completes audit UX/retention);
  no retention policy decided (open product decision, audit volume is
  small: identity events only so far).
- Self-suspension/self-deactivation by an authorized admin is not
  specially prevented in v1.
- `UserPermissionGate` role-resolution still short-circuits for
  legacy `admin` role before account-status checks (Stage 03
  behavior, out of scope); account-status denial itself is enforced.
- Role fields (`users.role_id`/`role_key`, legacy `roles` table)
  remain — removal is a later, separately approved stage.
- Suspended users' *memberships* remain visible as active rows to
  administrators; operational denial is by account status (by
  design, enables restore).
