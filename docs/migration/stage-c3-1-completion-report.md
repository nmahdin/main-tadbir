# Stage C3-1 completion report — organization lifecycle & operational access guard (three-state amendment)

Branch `arena/582a70e5-main-tadbir` (PR #14, open, unmerged),
pending explicit human acceptance. Incorporates the approved
amendment replacing the two-state lifecycle with three states.

## Lifecycle schema & transition contract

Migration `2026_10_15_000008` (amended in-stage before merge)
extends `organizations`: `suspended_at`, `suspended_by_user_id`
(FK users, nullOnDelete), `ended_at`, `ended_by_user_id` (FK
users, nullOnDelete), `status_version` (default 1). Existing rows
keep their status (default `active`). MySQL enforces
`status IN ('active','suspended','ended')` via CHECK; the
`OrganizationStatus` enum is authoritative on SQLite. `ended` is
a logical termination state only — no SoftDeletes, no record in
any organization/workspace/membership/role/operational table is
deleted. Rollback refuses while any lifecycle history exists.

`OrganizationLifecycleService` exposes four explicit operations,
all requiring a non-empty reason and a verified platform actor,
each committing state + metadata + `status_version` increment +
C1 audit (`organization.suspended|reactivated|ended|restored`,
with previous/new state and reason) in one organization-row-
locked transaction:

| Operation | From | To |
| --- | --- | --- |
| `suspend` | active | suspended |
| `reactivate` | suspended | active |
| `end` | active, suspended | ended |
| `restoreEnded` | ended | active (only exit) |

Everything else, including duplicates, is `invalid_transition`;
a wrong expected version is `stale_version`; a blank reason is
`reason_required`; a non-platform actor is
`platform_authority_required`. Ending from suspended preserves
the suspension stamp; restoring clears all lifecycle metadata.

## Authorization precondition (C3-2 compatible)

C3-1 deliberately provisions **no** new platform permissions. The
service verifies, from persisted assignments via
`PlatformAuthorizer`, that the actor is a Primary Administrator;
legacy admins and organization managers receive nothing, and a
caller-supplied user ID is never treated as proof. C3-2 will map
`suspend`/`reactivate` → `platform.organizations.manage_status`,
`end` → `platform.organizations.end`, and `restoreEnded` →
`platform.organizations.restore`, add the HTTP layer, and update
protected-role provisioning — without changing transition rules.

## Access guard & bypass paths addressed

`OrganizationAccessGuard` (single active-only rule) is integrated
into: `WorkspaceContextResolver` (hence the central
`AuthorizationService` and the Projects pilot — reads and writes);
`WorkspaceAccess` (workspace list/show); `MembershipPermissions`
(organization and workspace keys collapse to none, which closes
`OrganizationRoleService`, `WorkspaceRoleService`, and both role
controllers); and the Core `OrganizationController` list/show.
Workspace role mutations now take the organization row lock after
the workspace scope lock, so they serialize against suspension.
The platform organization directory intentionally bypasses the
guard (administrative visibility retained for suspended/ended).

Member-facing denials use the generic `organization_unavailable`
reason and plain 403s — members never see the lifecycle reason,
nor which non-active state applies. Reasons live only in audit
and future authorized platform views.

## Scheduled operations & remaining limits

Core has no organization-owned scheduled jobs today; the only
console activator is legacy, non-Core-scoped code outside the
central authorization path (consumers migrate incrementally, as
documented since 04A). Accordingly C3-1 changes no scheduling
behavior: suspension/end neither pause nor delete any background
work, and lifecycle restoration provably touches nothing outside
the organization row. **C3-3 must** pause scheduled work on
suspension, stop it on end, resume only eligible non-expired work
on reactivation, and never replay pre-termination pending work
after restore. Also remaining: requests that resolved a context
before a suspension commit can finish their in-flight operation
(contexts are per-call snapshots); transactional writers covered
by the organization lock (role services) are serialized exactly.

## Verification

- `OrganizationLifecycleTest` (13 tests): defaults; audited,
  versioned suspend/reactivate; full end/restore cycle incl.
  `reactivate`-on-ended rejection and suspended-metadata
  preservation; the complete invalid-transition matrix;
  reason/authority/stale validation (org manager + legacy admin
  rejected); audit-failure rollback for suspend and end; domain
  and HTTP denial for workspace/org reads and writes with
  personal and other-organization access intact; platform
  directory visibility of suspended organizations; restoration
  provably preserving memberships, workspaces, and roles.
- `OrganizationLifecycleConcurrencyMysqlTest` (4 tests, InnoDB):
  concurrent suspend, concurrent end (exactly one commit; stale
  and duplicate attempts rejected; restore only via
  `restoreEnded`), suspension vs workspace-role creation, and
  suspension vs organization-role assignment — each asserting
  committed postconditions after contention.
- Full regression green in CI (C1, C1-H1, C2-1…C2-5, 03A–04B,
  frontend gates).
