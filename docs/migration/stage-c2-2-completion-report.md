# Stage C2-2 completion report — platform authorization & role services

Status: implemented on PR #14 (branch `arena/582a70e5-main-tadbir`),
pending explicit human acceptance. Domain services only: no
Platform HTTP APIs, no bootstrap, no emergency recovery (later C2
packages). Organization suspension remains C3.

## What was built (`app/Core/Platform/`)

- **`PlatformAuthorizer`** — evaluates platform authority solely
  from an active assignment held by an operationally active
  account (`AccountStatus::allowsOperationalAccess`). Fail closed:
  non-active accounts, missing/revoked assignments, unknown and
  non-platform keys all yield no authority. It is deliberately
  disconnected from the workspace `AuthorizationService` —
  platform privileges never resolve, imply, or satisfy
  organization/workspace membership (proven by test: a primary
  administrator still receives the membership-taxonomy denial in
  any workspace).
- **`PlatformControlLock`** — the single serialization point. All
  platform mutations lock the singleton control row first. Global
  lock order (reconciled with C1/C1-H1):
  legacy admin role row → platform control row → user row →
  role rows / scope containers. Lifecycle is the only path taking
  the legacy lock; platform services never do, so no cycle exists.
- **`PlatformRoleService`** — custom role create / permission
  update / delete. Every mutation requires
  `platform.admins.manage`, validates keys through
  `PermissionCatalog::assertKnownKeysForScope` (unknown/cross-scope
  → 422), and enforces `GrantCeiling` (permission edits affect
  every assignee, so they are ceiling-checked like grants). The
  protected primary role cannot be edited or deleted; an actor
  cannot edit a role they actively hold; roles with assignment
  history cannot be deleted.
- **`PlatformAssignmentService`** — grant / soft-revoke / atomic
  replace, each in one control-locked transaction with its audit
  record written inside the same transaction:
  - actor must hold `platform.admins.manage` from their own
    platform assignment (legacy admin status confers nothing);
  - Grant Ceiling against the granted role's full key set;
  - self-modification prohibited across all three operations;
  - granting/replacing into `primary_administrator` requires an
    eligible active Primary Administrator actor;
  - revoke/replace cannot remove the last usable Primary
    Administrator (`PlatformPrimaryGuard`, evaluated under the
    control lock);
  - replacement soft-revokes the old assignment and creates the
    new one atomically — guard/ceiling failures roll both back
    (proven by test: the last primary's assignment survives a
    rejected replacement untouched).
- **Audit actions:** `platform.role_created`,
  `platform.role_permissions_updated`, `platform.role_deleted`,
  `platform.role_granted`, `platform.role_revoked`,
  `platform.role_replaced` — via the C1 `AuditWriter` (masked,
  same-transaction, append-only).

## AccountLifecycle integration (C1 behavior preserved)

`AccountLifecycle` now takes the platform control lock after the
legacy admin-role lock and runs `PlatformPrimaryGuard` for
suspend/deactivate: the final usable Primary Administrator cannot
be suspended or deactivated through normal lifecycle operations
(C1/C1-H1 tests pass unmodified — the guard is a no-op for users
without primary assignments). Suspended primaries immediately
evaluate to zero platform authority; assignments are inert while
an account is not operationally active and are never deleted by
status transitions.

## Verification

- `PlatformAuthorizationTest` (SQLite, 10 tests): fail-closed
  evaluation; grant authority + audit; ceiling, self-grant,
  duplicate grant; primary-grant eligibility; revoke +
  self-revoke + final-primary protection; atomic replacement +
  full rollback; role-management ceiling/protection/self-edit;
  history-bearing role deletion; lifecycle final-primary
  protection (suspend + deactivate); workspace isolation.
- `PlatformConcurrencyMysqlTest` (real MySQL, 2 tests): competing
  revokes contend on the control-row lock (loser verifiably blocks
  with lock-wait timeout; final usable primary survives), and
  role-permission edits serialize on the same lock before
  succeeding with audit.
- Full CI green: backend suite incl. C1/C1-H1 identity, C2-1
  schema, 03A/03B RBAC + MySQL concurrency; MySQL migration gate;
  frontend.

## Limitations

- Services have no HTTP surface yet; authorization decisions are
  enforced at the service boundary (future controllers must reuse
  these services rather than re-implementing rules).
- Nobody can become a platform administrator until the bootstrap
  package ships; services are exercised in tests via directly
  created assignments.
- Role `version` remains provisioner-managed metadata; no
  optimistic-locking workflow consumes it yet.
