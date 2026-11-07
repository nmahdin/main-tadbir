# CORE-UX-FIX-01 — Demo Access Repair & Canonical Theme Alignment

Branch `arena/582a70e5-main-tadbir` (PR #14, unmerged). Baseline
`c54093a` (which already contained the owner's theme consolidation
and both MariaDB migration fixes).

## A. Root cause of the widespread access denial

Login worked; authorization was empty. The React shell authorizes
through the **legacy permission plane**: `GET /auth/me` →
`User::permissionKeys()` returns the permissions of the user's
**legacy role** (`users.role_id`), and `canUsePermission` also
requires an active account (+ active role). Until this fix,
`tadbir:seed-demo` provisioned only the **Core** plane
(organization/workspace memberships, C7 settings) and never gave
the demo accounts a legacy role — so `/auth/me` returned
`permissions: []`, `roleId: null`, and nearly every page and
sidebar entry (legacy-permission-gated) denied access, and legacy
API `permission:` middleware would 403 as well. It was a
**demo provisioning gap**, not a frontend-guard or backend-authz
bug; a successful login was never evidence of grants.

Secondary findings: (1) the Sidebar offered «تنظیمات سامانه» to
`content.edit`-only users while the route requires
`settings.manage` — an offered-but-blocked page; (2) Core-scoped
pages (scoped settings) were fine because they authorize
server-side per Core membership.

## B. Demo provisioning repair (`SeedDemoData`, local/testing only)

After creating the demo users, the seeder now runs the idempotent
legacy catalog seeders and provisions legacy access **explicitly**:

- `demo_manager` role (DEMO-marked, `#39677C`) carrying the
  operational catalog **minus** `users.*`, `roles.*`, and
  `content.force_delete` — i.e. implemented-feature permissions
  without account/role administration or hard deletion. Assigned
  to `demo-owner`, whose Core organization/workspace manager
  memberships still come from the real C3 provisioners.
- `demo-member` gets the seeded minimal `team_member` role
  (`tasks.view`).
- Nothing about Core changes: no Platform assignments, no
  workspace-access bypass, grant ceilings untouched, subscription
  still only via the documented pre-authorized
  `DEMO_SUBSCRIPTION_ACTOR` path. Deterministic re-runs converge
  (role permission sync is part of the demo contract).

Pages now reachable for `demo-owner` (real backend): dashboard,
projects/tasks (workspace-selection list first), content, DAM,
comments, messaging, calendar, meetings, think-tank, secretariat,
departments, reports, integrity, legacy Settings, Core scoped
settings + invitations (Core memberships). **Intentionally still
inaccessible:** user management and role management
(`users.view`/`roles.view` not granted — sidebar hides them and
the APIs refuse), and any Core organization/workspace the demo
account is not a member of (cross-scope 403, regression-tested).

## C. Frontend navigation corrections

- Sidebar `canViewSettings` now equals the route guard
  (`settings.manage` only) — no more offered-but-blocked Settings.
- Auth failure remains distinct: 401 restores a signed-out state
  with no error copy; permission denials render as page states.
- Missing Workspace context already routes through the
  workspace-selection list views; with grants repaired the demo
  account reaches them instead of a misleading denial.

## D. Canonical theme alignment

The owner consolidated `/theme-previews` into the sole design
reference with a **single approved palette**: ocean `#39677C`
(gallery text: «قالب واحد تدبیر»; candidates deliberately
removed; the owner's own `themePreview.test.mjs` pins it). No
ambiguity remained to document. Alignment performed:

- `src/index.css :root` now carries the approved tokens
  (`--color-primary #39677c`, hover `#2b5266`, background
  `#f5f9fa`, surface-muted `#edf4f7`, border `#e2e9ec`, text
  `#243944`, muted `#617b89`). All DS primitives already consume
  these variables (buttons, tabs, checkboxes verified), and
  Tailwind `indigo-*` utilities derive from `--color-primary`
  via `@theme inline`, so the whole app follows from one token.
- Semantic success/warning/danger/info tokens unchanged; the
  preview never redefines them either (test-pinned).
- `/_dev/ui-showcase`'s gallery lives on inside the canonical
  preview (owner's consolidation); DS test files were repointed
  to it — the component catalog remains, the palette source is
  now single.
- Theme tests updated where they encoded the superseded
  candidate-switching design (four palettes, palette-switch
  state); the invariants (same tokens, portal inheritance via
  `body[data-tadbir-theme-preview='ocean']`, unmount cleanup,
  fictional-only) are all still asserted — no test was weakened
  to pass.

## E/F. Verification

- Backend: `DemoSeedingTest` now asserts the demo role contract,
  `/auth/me` payload, minimal member grants, and Core settings
  access + cross-organization denial for the demo owner.
- Frontend: 222/222 tests (5 new `uxfix01` gates: permission
  evaluation semantics, sidebar↔route agreement, 401-vs-403
  distinction, canonical-token sharing, portal inheritance);
  typecheck + production build green.
- CI (all five jobs incl. MySQL + MariaDB 10.11 + MariaDB 10.4
  legacy gates) recorded in the stage message.

## Windows-local verification

```powershell
cd backend
git pull
php artisan tadbir:seed-demo   # re-run is safe/idempotent
cd ..\frontend
npm run dev
```

Log in as `demo-owner` (your `DEMO_USER_PASSWORD`) → sidebar shows
the operational sections; «تنظیمات دامنه‌ای» opens Core settings
for DEMO Organization; user/role management is absent by design.
`/theme-previews` (no login needed) shows the canonical palette
the app now uses.
