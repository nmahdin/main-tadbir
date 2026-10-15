# Stage 04B — Projects Access-Path Inventory (pre-change)

Baseline `6d537a1`. "Projects family" = every route/service that reads or writes project-owned data. Disposition: **PILOT** = migrated in 04B to the central decision; **LEGACY** = unchanged legacy authorization, with the pilot firewall where it could otherwise leak workspace-owned data; **STAGE 05** = owned by a later module migration.

## Pilot contract (applies to every PILOT row)

A request enters **scoped mode** when it carries a requested workspace context (`workspace_id` input or `X-Workspace-Id` header) *or* when the bound project record is workspace-owned (context is then derived server-side from the record, never from the client). Scoped mode = `AuthorizationService` decision (memberships + scoped `projects.*` permission; gates not engaged — §"Gates" in the 04B report) + workspace-scoped queries + record assertions. **Legacy mode** (no context requested, record workspace-less) keeps the legacy permission middleware semantics and `ProjectScopeAccess` exactly as before. Firewall rule in both directions: workspace-owned projects are invisible to legacy mode (excluded from lists, 404 on detail/restore/search), and legacy records are unreachable in scoped mode — data can never cross the boundary through the wrong path. Full removal of legacy mode is the Projects sunset step recorded in the 04B report.

## Inventory

| # | Access path | Entry points | Before 04B | Disposition |
|---|---|---|---|---|
| 1 | Project list (filters, search, sort, pagination) | `GET /projects` (`ProjectController::index`) | legacy `projects.view` + project manager/member row scoping | **PILOT** (scoped mode: workspace + `projects.view`; legacy mode: unchanged + firewall) |
| 2 | Project create | `POST /projects` (`store`) | legacy `projects.create`, template application | **PILOT** (scoped create writes `workspace_id`, validates members/manager are active workspace members; template tasks inherit workspace) |
| 3 | Project detail | `GET /projects/{project}` (`show`) | `ProjectScopeAccess::assertView` | **PILOT** |
| 4 | Project update (incl. member sync, archive→active restore via status) | `PUT/PATCH /projects/{project}` (`update`) | `assertEdit` | **PILOT** (`projects.edit`) |
| 5 | Project archive | `DELETE /projects/{project}` (`destroy`) | `assertArchive` | **PILOT** (`projects.delete`) |
| 6 | Project force-delete (archived only) | `DELETE /projects/{project}/force` (`forceDestroy`) | `assertArchive` + status guard | **PILOT** (`projects.delete`) |
| 7 | Project memberships | `memberIds` on create/update; `project_user` pivot | existence-only validation | **PILOT**: scoped mode validates active workspace membership of every member/manager (cross-workspace association → 422); project membership stays an assignment concept, not the data boundary |
| 8 | Content plans | `GET/POST/PUT/DELETE /projects/{project}/content-plan[/{plan}]` | `assertView/assertEdit` + series-belongs-to-project guard | **PILOT** (nested: parent project authorized first; plan asserted in project+workspace; plans carry `workspace_id`) |
| 9 | Operations summary + domain items (contents, series, tasks, assets, ideas, meetings, activities) | `GET /projects/{project}/operations/…` | `assertView` + per-domain legacy checks | **PILOT at the project boundary** (project authorized centrally; all queries already project-bound; other domains' legacy checks remain theirs until their Stage 05 slices) |
| 10 | Project templates CRUD | `/project-templates…` (`ProjectTemplateController`) | legacy `projects.*` route permissions | **LEGACY** (templates are installation-wide reference data with no workspace ownership in this stage; applying one to a scoped project validates as in #2) |
| 11 | Template application (fan-out task creation) | `ProjectTemplateApplication` (inside project create) | legacy `tasks.create` checks inside service | **LEGACY service, PILOT-aware result** (created tasks inherit the project's `workspace_id`; service logic otherwise unchanged) |
| 12 | Tasks referencing projects | `TaskController`, `TaskOperations` (Tasks module) | legacy task checks | **STAGE 05 (Tasks)** — tasks gain nullable `workspace_id` now so project flows can stamp it; task endpoints not migrated here |
| 13 | Content/series referencing projects | Content module controllers | legacy content checks | **STAGE 05 (Content)** — project relation validated only through the project boundary (#8/#9) |
| 14 | Restore of archived records incl. projects | `RestoreController` | `ProjectScopeAccess::assertEdit` | **PILOT firewall** (workspace-owned projects restore only via scoped `projects.edit`; others unchanged) |
| 15 | Global search project results | `GlobalSearchController` | legacy `projects.view`, unscoped query | **LEGACY + firewall** (workspace-owned projects excluded; full search isolation is the Stage 05 Reporting slice — carried risk, see report) |
| 16 | Analytics/reporting project aggregates | `AnalyticsController` etc. | installation-wide legacy aggregates | **STAGE 05 (Reporting)** — carried risk, unchanged by design of this stage's scope |
| 17 | Attachments / DAM relations of projects | DAM controllers/services | DAM legacy checks | **STAGE 05 (DAM)** — project operations assets stay project-bound (#9) |
| 18 | Background/console & Bale operations touching projects | Bale handlers, artisan commands (e.g. completion commands) | legacy service-level checks | **STAGE 05** — no consumer migrated; the central decision is callable from these surfaces (04A), adoption is per-slice |
| 19 | Project progress/activity logging | `ProjectProgress`, `ActivityLog` writes inside #2/#4/#5 | — | **PILOT-compatible** (writes remain project-bound inside authorized mutations) |

## Permission mapping (legacy → workspace-scoped, same stable keys)

| Legacy global key | Scoped key (Core catalog, workspace scope) | Endpoints |
|---|---|---|
| `projects.view` | `projects.view` | list, detail, content-plan list, operations |
| `projects.create` | `projects.create` | create |
| `projects.edit` | `projects.edit` | update, content-plan write, restore |
| `projects.delete` | `projects.delete` | archive, force-delete |

Project templates keep the *legacy* keys (row #10) in this stage.
