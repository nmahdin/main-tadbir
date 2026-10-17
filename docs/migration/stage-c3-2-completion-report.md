# Stage C3-2 completion report — organization lifecycle permissions & platform APIs

Branch `arena/582a70e5-main-tadbir` (PR #14, open, unmerged),
pending explicit human acceptance.

## Permissions & explicit Primary expansion

Registered in `PermissionCatalog` (platform scope) exactly:
`platform.organizations.manage_status` (suspend/reactivate),
`platform.organizations.end` (terminate), and
`platform.organizations.restore` (special restoration).
Registration grants nobody anything.

`PlatformRoleProvisioner::PRIMARY_PERMISSIONS` was expanded by
explicit reviewed change to the 9-key C3 set. An existing role
holding exactly the frozen C2 6-key set is upgraded by the
provisioning run (new keys attached); any other drift remains a
loud `PlatformProvisioningException`. Catalog `sync()` alone never
touches role privileges, repeat provisioning is idempotent, and
the C2-1 schema assertions were updated to the reviewed 9-key set.

## Authorization refactor

`OrganizationLifecycleService` no longer treats Primary status
as authority: each operation evaluates its own key through
`PlatformAuthorizer` against persisted assignments
(suspend/reactivate → manage_status, end → end, restoreEnded →
restore). Custom platform roles can hold any subset; Primary
holds all three only through the provisioning above; legacy
admins and organization owners get nothing; caller identity is
never privilege evidence. Transaction, organization-row lock,
expected-version check, and transactional audit are unchanged
from C3-1 (failed audit still rolls everything back — now also
proven through HTTP).

## HTTP contract (`/api/v1/platform`, Sanctum)

- `GET organizations/{organization}` — `platform.organizations.view`; admin detail (status, status_version, suspended/ended timestamps + actor IDs, created_at). Reasons are **not** exposed (audit trail only, `platform.audit.view`); no workspace data.
- `POST organizations/{organization}/suspend|reactivate` — manage_status; `POST .../end` — end; `POST .../restore` — restore. Body: `reason` (required, ≤1000 chars) + `status_version` (required int); the domain service revalidates both inside its transaction.
- Errors: 401 unauthenticated; 403 `platform_forbidden`; 404 unknown organization; 409 `stale_version` / `invalid_transition`; 422 framework validation, or domain `reason_required` on the service path.

## Verification

`PlatformOrganizationLifecycleApiTest` (7 tests): the full
permission matrix (each single-key custom role succeeds only at
its own operation; view is read-only); explicit-provisioning
upgrade (sync grants nothing → provisioning upgrades exactly the
C2 set → idempotent at 9 keys); the complete HTTP transition
contract incl. duplicate/stale/missing/blank variants and audit
contents; 401s; legacy-admin and organization-owner denial;
admin visibility with reason privacy and member-facing generic
denial; preservation of memberships/workspaces through `end`;
audit-failure rollback through HTTP. C3-1 service and MySQL
concurrency suites, C1/C2 regressions, Pint, and frontend gates
all remain green in CI.

## Remaining issues

None in scope. Organization-owned background-job orchestration
remains C3-3; frontend administration UI is a later stage; no
production deployment performed.
