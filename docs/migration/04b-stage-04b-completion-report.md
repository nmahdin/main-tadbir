# Stage 04B Completion Report — Projects Workspace Isolation Pilot

Status: **IMPLEMENTED — awaiting review.** Stage 05 is not started.

## 1. What shipped

- **Access-path inventory (deliverable 1):** `docs/migration/04b-projects-access-path-inventory.md` — 19 paths with PILOT / LEGACY / STAGE 05 dispositions and the explicit dual-mode pilot contract.
- **Schema:** migration `2026_10_15_000003_add_workspace_id_to_project_records.php` adds nullable `workspace_id` (FK → `workspaces`, `restrictOnDelete`) to `projects`, `project_content_plans`, and `tasks`. Additive and reversible; no data rewritten.
- **Catalog:** `projects.view/create/edit/delete` registered in the Core `PermissionCatalog` with workspace scope — same stable keys as the legacy catalog, which stays canonical for unmigrated modules. Workspace Manager roles pick the keys up automatically (catalog-driven defaults).
- **Authorization integration:** `app/Modules/Projects/ProjectAuthorizer.php` is the single adapter between Projects HTTP requests and the Stage 04A engine (`AuthorizationService` + `WorkspaceScope`). `ProjectController`, `ProjectContentPlanController`, and project-owned reads in `ProjectOperationsController` delegate to it; the `permission:projects.*` route middleware was removed from pilot routes only (templates keep the legacy middleware). No parallel authorization logic in controllers.
- **Pilot contract (firewall):** scoped mode when a workspace context is requested (`workspace_id` input / `X-Workspace-Id` header) or the bound project is workspace-owned (context derived server-side from the record — client IDs are never proof). Legacy mode serves only `workspace_id IS NULL` records with unchanged legacy checks. Workspace-owned projects are invisible to legacy list/detail/restore/search; legacy records asked for in a workspace context are 404 (foreign ≡ missing). Restore of workspace-owned projects requires scoped `projects.edit`; legacy global search excludes workspace-owned projects. Template-fanned tasks inherit the project's `workspace_id`; template tasks are stamped at creation.
- **Membership validation:** scoped create/update reject (422) project members/managers who are not active members of the project's workspace — cross-workspace associations are never silently attached. Content plans inherit their project's workspace; scoped access asserts plan ∈ context.
- **API contract:** additive `workspaceId` on `ProjectResource`; optional `workspace_id` request input on project list/create. No existing fields changed; no UI changes.

## 2. Gates (task 8, hardened in the conditional-approval correction)

Scoped authorizations now pass module id `projects` to the central service, so the module-availability, organization-policy and subscription-entitlement gates are **engaged on every workspace-scoped Projects operation**. They are evaluated through a narrowly scoped, explicit pilot policy (`app/Modules/Projects/Pilot/`, configured in `config/projects.php`):

- `PilotGatePolicy` affirms a gate **only** when all three hold: (1) the module is `projects` (never any other module), (2) `PROJECTS_WORKSPACE_PILOT` is explicitly opted in (config `projects.workspace_pilot.enabled`, default **off**), and (3) the application environment is **not `production`**.
- In every other case each pilot gate returns `GateDecision::unavailable` — the same state as an unimplemented gate — and the central service fails closed (403). **Production is therefore fail-closed even if the opt-in flag is set**, and no scoped request silently bypasses the gates.
- The pilot gates are wired only into the dedicated `AuthorizationService` instance inside `ProjectAuthorizer`; all other consumers still get the Stage 04A unimplemented fail-closed gates. No globally permissive gate exists, and no subscription lifecycle is invented — Q-01 remains OPEN; this is a development-stage allowance with a hard production stop, to be deleted when real gate implementations land.
- Tests pin the behavior precisely: happy-path pilot tests perform the explicit non-production opt-in in `setUp`; `test_pilot_gates_deny_scoped_access_without_explicit_opt_in` (flag off → 403 on read/list/create); `test_pilot_gates_fail_closed_in_production_even_when_opted_in` (env=production + flag on → 403, nothing created); `test_pilot_policy_never_affirms_other_modules_or_permissions` (tasks/contents/billing never affirmed); `test_unresolved_gate_identifiers_fail_closed_at_engine_level` (engine-level, unchanged).

## 3. Tests

`backend/tests/Feature/Projects/ProjectsWorkspacePilotTest.php`: scoped CRUD happy path; two-workspace isolation incl. direct-ID and requested-context mismatches; org member without workspace membership; workspace member without `projects.*` (denied, then `projects.view`-only custom role: read yes / write no); cross-workspace member rejection (422) + content-plan workspace stamping; content-plan/operations scoping; archive + scoped restore + legacy-search firewall + deactivated membership + suspended workspace; legacy path preservation + firewall both directions; engine gate fail-closed; pilot gate denials (opt-in off, production, other modules); template task workspace inheritance. `ProjectsAnalyticsIsolationTest.php` covers §4. Existing suites untouched — legacy mode keeps them on the pre-pilot path.

CI evidence: see §6.

## 4. Analytics isolation hardening (conditional-approval correction)

`AnalyticsController` previously aggregated **all** projects (and tasks) installation-wide under only the legacy `reports.view` permission, exposing workspace-owned project counts, identifiers and names. It now firewalls every workspace-owned record out of the endpoint: project totals/completion, the active-projects summary (ids/names), task totals/status groups, and the department workload join all filter `workspace_id IS NULL`. Legacy behavior for workspace-less data is byte-for-byte preserved (existing `PhaseThreePerformanceTest` analytics assertions unchanged and green).

**Audit of other legacy aggregate/summary surfaces** (same exposure pattern), dispositions:

| Surface | Finding | Action |
|---|---|---|
| `AnalyticsController` | Project/task aggregates + active list leaked workspace-owned ids, names, counts | **Fixed** (`whereNull('workspace_id')` everywhere) |
| `DepartmentDashboardController` | Department member/manager project + task lists could surface workspace-owned projects | **Fixed** (same firewall on both queries) |
| `UserController` directory | `active_projects_count`, task counts and workload score counted workspace-owned records | **Fixed** (same firewall in counts + workload subquery) |
| `GlobalSearchController` | Fixed in the original 04B slice (projects) | Already firewalled; tasks via `TaskOperations::visibleTo` remain Tasks-domain legacy, Stage 05 |
| Record-level legacy paths (Tasks endpoints, DAM/ContentSeries project attach, comments) | Not aggregates; governed by their own legacy record checks | Unchanged — owning Stage 05 slices; recorded in the inventory |

Regression coverage: `backend/tests/Feature/Projects/ProjectsAnalyticsIsolationTest.php` seeds workspace-owned projects/tasks in **two** workspaces plus legacy records and asserts (a) workspace actors without `reports.view` get 403, (b) a legacy reporter sees only workspace-less totals, no workspace names/ids anywhere in the payload, (c) department dashboard and user directory counts exclude workspace-owned records while including legacy ones.

## 5. Known limits / follow-ups for Stage 05

- Tasks endpoints (`/tasks*`, task commands, DAM series project attach, WorkspaceRecord project links) remain legacy-scoped; `tasks.workspace_id` is stamped only in project flows. Full Tasks slice is Stage 05.
- Project templates remain global legacy reference data; the auto-series attach in project operations keeps legacy `series.create`.
- The `_legacy_read` A04/A12/A13 items are untouched (other stages).
- No audit-log emission for pilot decisions yet (engine limitation carried from 04A).

## 6. CI evidence

Commit `7b9112c` (head of this stage's commit chain on PR #14): push run `38726692280` and PR run `38726686026`, **all jobs SUCCESS**:

- Backend contracts and tests (SQLite PHPUnit incl. the 10 pilot tests and all pre-existing suites unchanged), scoped Pint, architecture tests: **PASS**
- Backend migration gate on MySQL 8.0 (incl. migration `2026_10_15_000003`): **PASS**
- Frontend typecheck, tests and artifact: **PASS**
- GitGuardian: **PASS**

Iteration notes (same chain): the scoped-Pint failure (empty promoted constructor), the `WorkspaceListRequest` unknown-filter rejection of `workspace_id` (422s), and two test-fixture corrections (legacy permissions are a pivot, not a JSON column; template fan-out reads the template `tasks` attribute and keeps its legacy `tasks.create` requirement) were each fixed forward; temporary CI diagnostics used to surface failures were removed in the same chain. Template-based scoped creation therefore still requires the actor to hold the legacy `tasks.create` permission during the pilot (fail-closed, unchanged legacy service) — the Tasks slice in Stage 05 owns migrating that check.
