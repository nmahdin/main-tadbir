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

## 2. Gates (task 8)

Module/policy/entitlement gates are **not engaged** for the pilot: controllers authorize without a module id, as the Stage 04A engine prescribes. No permissive bypass was introduced anywhere — unknown gate identifiers still fail closed at engine level, asserted by `test_unresolved_gate_identifiers_fail_closed_at_engine_level`. When a real module id and bindings are registered (owning stage), the adapter is the single call site to extend. Q-01 (subscription lifecycle) remains OPEN; nothing invents subscription behavior.

## 3. Tests

`backend/tests/Feature/Projects/ProjectsWorkspacePilotTest.php` (10 tests): scoped CRUD happy path; two-workspace isolation incl. direct-ID and requested-context mismatches; org member without workspace membership; workspace member without `projects.*` (denied, then `projects.view`-only custom role: read yes / write no); cross-workspace member rejection (422) + content-plan workspace stamping; content-plan/operations scoping; archive + scoped restore + legacy-search firewall + deactivated membership + suspended workspace; legacy path preservation + firewall both directions; engine gate fail-closed; template task workspace inheritance. Existing suites untouched — legacy mode keeps them on the pre-pilot path.

CI evidence: see §5 (filled after the run completes).

## 4. Known limits / follow-ups for Stage 05

- Tasks endpoints (`/tasks*`, task commands, DAM series project attach, WorkspaceRecord project links) remain legacy-scoped; `tasks.workspace_id` is stamped only in project flows. Full Tasks slice is Stage 05.
- Project templates remain global legacy reference data; the auto-series attach in project operations keeps legacy `series.create`.
- The `_legacy_read` A04/A12/A13 items are untouched (other stages).
- No audit-log emission for pilot decisions yet (engine limitation carried from 04A).

## 5. CI evidence

_(updated after CI completes)_
