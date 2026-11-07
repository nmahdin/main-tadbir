# Stage C3-3 completion report — organization job safety, concurrency & final C3 verification

Branch `arena/582a70e5-main-tadbir` (PR #14, open, unmerged),
pending explicit human acceptance. This report also serves as
the C3 completion summary. **No production deployment occurred;
production databases were never accessed.**

## Background-operation inventory (inspected, exact paths)

| Path | Classification | Guard treatment |
| --- | --- | --- |
| `backend/app/Console/Commands/{IssuePlatformOperationToken,ExecutePlatformOperation,ProcessPlatformOperations}.php` | Global platform-operational plane (C2-4); no organization scope | Unaffected by design; operator-secret authorized |
| `backend/routes/console.php` `bale:tick` (scheduled every minute) + `backend/app/Bot/Bale/**` | Legacy/global messaging delivery; not Core organization-owned | Outside Core migration scope; untouched |
| `backend/routes/console.php` `content:overdue-notifications`, `contents:allocate-codes`; `backend/app/Services/PlannedOccurrenceActivator.php` (+ `ActivatePlannedSeriesOccurrences` command) | Legacy business services over legacy `Content` records; not linked to Core organizations/workspaces | Classified legacy/out-of-scope; future migration to Core must adopt the execution guard |
| Queue jobs (`app/Jobs`, `ShouldQueue` implementations) | **None exist in Core** | Nothing to apply; guard contract provided |
| HTTP-invoked Core services (`WorkspaceContextResolver`, `MembershipPermissions`, role services) | Organization/workspace-scoped, request-path | Guarded since C3-1 (access guard) |

## Guards added and enforcement points

- `OrganizationExecutionGuard` + `ExecutionEligibility`
  (`Executable`/`Paused`/`Terminated`): resolves scope from
  persisted records only. `assertJobScopeExecutable(workspaceId,
  claimedOrganizationId)` derives the owner from the workspace
  row; a contradicting claim is rejected as `scope_mismatch`
  even when the claimed organization is active. Suspended maps
  to Paused (skip without failing, preserve pending work);
  ended maps to Terminated (pre-termination work is permanently
  ineligible; restoration never replays it).
- Creation boundary: `Workspace`, `OrganizationMembership`, and
  `WorkspaceMembership` models now refuse creation under a
  suspended/ended organization (generic
  `organization_unavailable`). Personal workspaces and existing
  memberships (including account-deactivation cleanup) are
  unaffected. The only supported creation services are the 03A
  provisioners, which create resources for newly created
  (active) organizations or personal owners.

## Concurrency coverage and residual limitations

New MySQL proof (`OrganizationJobSafetyConcurrencyMysqlTest`):
a workspace-role write blocked on the organization lock while
suspension commits is **denied at the mutation boundary** after
acquiring the lock (nothing written); the reverse ordering
(writer commits, then suspension) applies cleanly and preserves
the write. Combined with C3-1's lock-order (workspace scope →
organization → membership/role) and the C3-1/C3-2 suites, all
currently transactional Core mutations serialize against
lifecycle transitions.

Residual, stated honestly: authorization contexts are per-call
snapshots. A plain read — or a non-transactional module write
such as the Projects pilot's post-authorization record creation —
that resolved its context before a suspension commits can finish
that in-flight call. Locks are never held across a request or
external I/O to "fix" this. C10/module writers must wrap writes
in transactions that revalidate through the guarded services.

## Scheduling/resumption: implemented vs deferred

Implemented: the eligibility contract, forged-scope rejection,
and the creation boundary. Deferred by design (no Core
organization-owned jobs exist): module-owned schedulers must,
on suspension, pause and preserve pending items and, after
reactivation, run only still-eligible unexpired items; on end,
stop work and treat pre-termination items as ineligible even
after restoration, which enables only newly scheduled work.
These are binding requirements recorded for the modules/C10,
not behavior C3-3 could meaningfully execute today.

## Lifecycle API & permission status (C3 recap)

Three-state lifecycle (`active|suspended|ended`) with four
operations; platform permissions
`platform.organizations.view/.manage_status/.end/.restore`
(C3-2); platform endpoints under `/api/v1/platform/organizations`
with reason + expected `status_version`; transactional audit;
platform directory retains administrative visibility without
exposing reasons or workspace data.

## Final C3 status separation

| Status | Verdict |
| --- | --- |
| **Code Complete** | Yes — C3-1, C3-2, C3-3 implemented; no approved-scope gaps remain in code. |
| **Security Verified** | Yes within documented boundaries (guarded creation/mutation paths, forged-scope rejection, generic member-facing denials; residual in-flight snapshot limitation recorded). |
| **Development/CI Ready** | Yes — full SQLite + MySQL suites, Pint scope, frontend gates, migration gates green. |
| **Production Operationally Ready** | **NO** — inherits the C2-5 blockers: production PHP-CLI-via-cron unverified, production MySQL version unconfirmed, secret custody and backups unprovisioned (`docs/operations/production-readiness-checklist.md`). Green CI is not production evidence. |

## Verification

New: `OrganizationExecutionGuardTest` (3 tests: eligibility
matrix incl. personal/global, forged-scope claims, creation
boundary for suspended and ended with personal-workspace
survival) and `OrganizationJobSafetyConcurrencyMysqlTest`
(2 tests, committed-postcondition assertions). Full regression
(C1, C1-H1, C2-1…C2-5, C3-1, C3-2, 03A–04B, all MySQL suites,
frontend CI job) green.
