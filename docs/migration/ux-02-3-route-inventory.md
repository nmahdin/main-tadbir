# UX-02-3 — Route Inventory & Migration Plan

**Date:** 2026-10-19 · **Branch:** `arena/582a70e5-main-tadbir` · **PR:** #14 (open, unmerged)

Status key: **Ocean** = canonical tokens/patterns · **Partial** = functional, legacy
accents/layout remain · **Legacy** = pre-Ocean presentation · **Blocked** = backend
functionality absent (never fake it).

## Operational lists (server-paginated)

| Route | Module | Component today | API | UI today | Action |
|---|---|---|---|---|---|
| `/projects` | Projects (operational) | `WorkspaceList(module=projects)` | `GET /projects` (`WorkspaceListRequest`) | Partial (indigo, prev/next only, inline filters, mobile table scroll) | **Migrate (Stage B)**: Ocean tokens, `PageSurface`, filter drawer + chips, numbered pagination, multi-sort headers, mobile cards, column prefs (C7 preferences), CSV export (Stage D) |
| `/tasks`, `/my-tasks` | Tasks (operational) | `WorkspaceList(module=tasks)` + kanban/calendar views | `GET /tasks` | Partial (indigo) | **Migrate list view** like projects; kanban/calendar keep behavior, token accents aligned |
| `/contents` | Contents (operational) | `WorkspaceList(module=contents)` | `GET /contents` | Partial (violet accents) | **Migrate** like projects (violet → Ocean) |
| `/notifications` | Notifications | `NotificationInbox` | `GET /notifications` | Partial | Light migration: `PageSurface` + token accents (no server-sort contract change) |
| `/approvals` | Contents approvals | `ApprovalCenter` | `GET /approvals` | Partial | Light migration (surface + accents) |
| `/departments` | Departments (legacy plane) | `DepartmentsView` | legacy departments API | Legacy | Stage E light migration if time permits (surface + accents); business logic untouched |
| `/user-management`, `/roles-management` | Identity/RBAC (legacy plane, permission-gated) | `UserManagementView`, `RoleManagementView` | legacy users/roles APIs | Legacy | Stage E light migration (surface + accents); do not touch authorization logic |
| `/archive`, `/assets`, `/secretariat`, `/messages`, `/calendar`, `/activity`, `/comments`, `/analytics`, `/integrity`, `/thought-room`, `/content-*` details | mixed legacy/feature modules | various | various | Legacy/Partial | Out of bounded scope this stage except surface background consistency; documented, not rewritten (avoid destabilizing working business UI) |

## Detail & forms

| Route | Component | UI today | Action |
|---|---|---|---|
| `/projects/:id` | `ProjectDetailView` (778 lines) | Legacy header/layout | **Stage C**: `PageSurface` + `DetailHeader` pattern (back near upper-right, title+status, one primary action far-left, more-actions menu); body logic untouched |
| `/tasks/:id` (drawer) | `TaskDetailDrawer` | Partial | Keep (dialog-family pattern already); token accents only if touched |
| `/contents/:id` | `ContentDetailView` | Legacy | Documented remaining (large workflow surface; not rewritten this stage) |
| Create/edit project/task/content | AppContext modals (`CreateProjectModal`, `EditTaskModal`, …) | Partial (DS Dialog family) | Keep; no risky autosave. Form architecture DEC F01–F08: dialog-for-short-forms already holds; dirty-guard/autosave/multi-step = **deferred** (would require touching every modal's state handling) |
| `/scoped-settings` | `ScopedSettingsPage` | Ocean (C7-4) | Keep; wrapped by surface background consistency |
| `/invitations/manage` | `InvitationManagerPage` | Partial | Light migration (surface + accents) |
| Platform/org management (roles, assignments, subscriptions admin) | API-only (C2/C5); UI lives in `/scoped-settings` platform tab (honest empty) | — | No fake admin pages invented; dashboards link only to real destinations |

## Shared foundations (Stage A)

- `WorkspaceListRequest`: sort allowlist `created_at|updated_at|deadline` + `direction`;
  strict unknown-param rejection. **Extend**: multi-sort spec `sort=field:asc,field2:desc`
  (allowlisted per module, unique fields, ≤3, stable `id` tiebreaker), legacy
  `sort`+`direction` keeps working.
- Frontend `parseListQuery` (URL state: search/filters/page/per_page/sort) → extend to
  parse/serialize the multi-sort spec deterministically.
- `Pagination` (prev/next + page-size) → **add numbered pages**.
- New `PageSurface` (white surface on `--color-background` #F5F9FA) + MainLayout
  background switch to the canonical token; UX-02-2 dashboards keep data logic
  (background consistency only).

## Addendum items

- **Sidebars**: UX-02-1 three shells preserved (right RTL, collapse, mobile drawer,
  Escape, ProfileDock). Platform/organization shell items extracted to a typed
  navigation config (`app/shell/navigation.ts`: key, title, icon, destination,
  permission, context, section); workspace nav already data-driven — typed as the
  same config shape. Rendering/ids unchanged (UX-02-1 gates must stay green).
- **Environment selector**: remove the recents section/badges entirely (context
  switching + persistence logic untouched server-side; UI simply stops surfacing
  recents); cards become large, concise, button-like (name, short role/type line,
  icon, discreet current marker only).
- **Content surface**: `PageSurface` adopted by selector + migrated lists/details;
  dashboards reviewed for background consistency only.

## Deferred / blocked (honest)

- **XLSX export**: no spreadsheet package in `composer.json`/`composer.lock`, and the
  lock cannot be regenerated in this sandbox (no Composer) → **deferred**; CSV ships.
- **Bulk actions**: no genuine bulk business endpoints exist (task/project bulk
  operations are not defined server-side) → selection/bulk UI **not** fabricated;
  deferred until a domain bulk action is approved. (DEC bulk rules documented here
  as the contract for when it lands.)
- **Column ordering drag**: visibility + restore-defaults ship; drag-reorder deferred.
- **Form autosave drafts / dirty-guard / multi-step**: deferred (modal state is
  AppContext-owned; touching all forms risks business regressions).
- **OPS-style detail activity old/new diffs**: detail Overview shows recent audit
  where an endpoint exists; full activity tabs deferred per-page.

## Tests required

- Backend: multi-sort parsing/allowlist/tiebreaker, CSV export authorization +
  formula-injection escaping + bounds (Feature tests).
- Frontend: list-state serialization round-trip + validation, numbered pagination,
  ux023 source gates (Ocean tokens, selector without recents, PageSurface adoption,
  nav config), existing ux021/ux022 + all suites stay green; five CI gates.
