# Stage C2-3 completion report — Platform Administration HTTP APIs

Status: implemented on PR #14 (branch `arena/582a70e5-main-tadbir`),
pending explicit human acceptance. Out of scope and untouched:
bootstrap, emergency recovery, organization suspension (C3),
plans/billing/settings/module gates, Controlled Hard Delete,
frontend UI.

## Endpoints (`/api/v1/platform`, Sanctum + active-account group)

| Method & path | Permission | Behavior |
|---|---|---|
| `GET platform/roles` | `platform.admins.view` | Paginated role list incl. permission keys |
| `GET platform/roles/{role}` | `platform.admins.view` | Role detail |
| `POST platform/roles` | `platform.admins.manage` | Create custom role (service-enforced ceiling/catalog) |
| `PUT platform/roles/{role}` | `platform.admins.manage` | Atomic metadata+permissions update; **requires `version`** — stale writes → 409 |
| `DELETE platform/roles/{role}` | `platform.admins.manage` | Service-guarded delete (protected/history rules) |
| `GET platform/assignments` | `platform.admins.view` | Active assignments; `include_revoked=1` exposes preserved history |
| `POST platform/assignments` | `platform.admins.manage` | Grant (201) |
| `POST platform/assignments/{assignment}/revoke` | `platform.admins.manage` | Soft revoke |
| `POST platform/assignments/{assignment}/replace` | `platform.admins.manage` | Atomic replacement |
| `GET platform/users` | `platform.users.view` | Read-only directory: id, name, username, status, platform role key, created_at; `status`/`search` filters |
| `GET platform/organizations` | `platform.organizations.view` | Read-only directory: id, name, slug, status, created_at — never workspaces |
| `GET platform/audit-logs` | `platform.audit.view` | Read-only C1 audit access; filters action/actor/target/dates |

Plus one additive change: `POST users/{user}/account-lifecycle`
now also accepts `platform.users.manage_status` as an
authorization path (legacy admin / `users.status` unchanged; all
C1/C1-H1/C2-2 lifecycle safeguards — final legacy admin, final
manager, final primary, terminal states — apply identically; no
competing lifecycle implementation was created).

## Design

Controllers (`Api/V1/Platform/*`) are thin adapters: a shared
trait performs per-endpoint `PlatformAuthorizer` checks and maps
domain outcomes to the stable contract; **all** mutation rules
(ceiling, self-modification, primary eligibility, final-primary
guard, atomicity, audit) remain in the C2-2 services, invoked
unchanged (one additive service method:
`PlatformRoleService::updateCustomRole` performing metadata +
permission update in a single control-locked transaction with
optimistic-concurrency version check and increment).

**Stable error contract:** 401 unauthenticated (Sanctum); 403
`{code: platform_forbidden}`; 404 unknown ids (route-model
binding); 409 `{code: platform_role_version_conflict}`; 422
framework validation or `{code: platform_operation_rejected}`.
Lists are paginated with `per_page` clamped to 1–100. Legacy
admin status confers nothing on any platform endpoint (tested).

## Verification

`PlatformApiTest` (11 tests): authN/Z denial matrix across all
endpoints; legacy-admin-without-assignment denial; suspended
platform user denial; role CRUD with version 1→2 and stale-write
409; protected-role edit/delete rejection; grant→replace→revoke
flow with preserved history; self-grant/self-revoke rejection;
final-primary replacement rollback over HTTP; user/organization
listing authorization, pagination and field minimality; audit
access control with masked summaries (secret never in response);
lifecycle endpoint accepting `manage_status` and rejecting
view-only actors. Full regression (C1, C1-H1, C2-1, C2-2,
03A–04B, MySQL concurrency suites) green in CI.

## Limitations

- Role update requires the client to send the current `version`;
  there is no merge/retry helper (409 is the contract).
- Audit `user_agent` is stored but not exposed; summary content
  is exactly what C1's writer masked at write time.
- Platform administration still has no bootstrap path: until the
  bootstrap package ships, assignments can only be created by an
  existing platform administrator or in tests/fixtures.
