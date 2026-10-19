# UX‑02‑3‑FINAL — Decision Traceability & Compliance Matrix

Audit date basis: delivered head `951b688f` (all five CI gates green), branch
`arena/582a70e5-main-tadbir`, PR #14 OPEN/unmerged. This matrix maps every
approved UX‑02‑3 decision to real routes, implementation files, and test
evidence. Status is judged per decision **on the routes the decision
governs** — not by the existence of a showcase component. "Gap closure"
column records what UX‑02‑3‑FINAL implements in this pass.

Legend: ✅ COMPLETE · 🟡 PARTIAL · ⛔ BLOCKED (external) · ❌ NOT IMPLEMENTED.

## A. UX‑LIST (routes: `/projects`, `/tasks` incl. `my-tasks`, `/contents` — all render `features/workspace/WorkspaceList.tsx` server-side; demo mode renders fixture views and is out of scope)

| ID | Decision | Implementation (files) | Test evidence | Status at 951b688f | FINAL gap closure |
|---|---|---|---|---|---|
| DEC-01 | Desktop DataTable on real routes | `WorkspaceList.tsx` (table + `WorkspacePatterns.tsx`) | ux023 gates; visual QA 1440 | ✅ | — |
| DEC-02 | Numbered server pagination, default 20, backend-only | `WorkspacePatterns.tsx: pageWindow/Pagination`; `WorkspaceListRequest` | ux023 pageWindow gate (source), PHPUnit pagination suites (pre-existing) | ✅ | — |
| DEC-03 | Page sizes 10/20/50/100; filter/sort/size change resets to page 1 | `Pagination perPageOptions=[10,20,50,100]`; `update()` deletes `page` | source gates phase2/refinement | ✅ | — |
| DEC-04 | Multi-column sorting: precedence, unique fields, asc/desc, stable `id` tiebreaker, backend allowlist, no client SQL | `WorkspaceListRequest::sortSpec/sortableFields`, 3 module controllers; `listQuery.ts: parseSortSpec/cycleSortField` | `WorkspaceListMultiSortTest` (3 tests incl. hostile input), ux023 (3 tests) | ✅ | — |
| DEC-05 | Mobile entity cards, no horizontal overflow | `WorkspaceList.tsx` `md:hidden` card list | visual QA 390 (mocked API) | ✅ | re-verified with bulk selection |
| DEC-06 | Advanced filters: RTL drawer, Apply/Clear, removable chips, reopen preserves values | filter drawer in `WorkspaceList.tsx` (draft state) | ux023 gates; visual QA 1440 | ✅ | — |
| DEC-07 | URL-driven validated state; no secrets in URLs | `listQuery.ts: parseListQuery` | phase2/refinement/ux023 tests | ✅ | — |
| DEC-08 | Column visibility (mandatory locked) + reorder + per-user/per-list cross-device prefs + restore defaults; visibility grants no access | `shared/api/preferences.ts`, C7 `user.experience.list_columns`; column menu in `WorkspaceList.tsx` | `ListColumnPreferenceTest`; ux023 gates | ✅ (FINAL) | **Drag/button reorder added, order persisted in same preference (v2 shape, legacy-compatible)** |
| DEC-09 | Bulk actions only where domain-supported: page-only select-all, cleared on state change, per-record authorization, confirmation + audit, per-record outcomes | DAM: `dam/library/bulk/*` (pre-existing, complete for DAM). Tasks/projects/contents lists: none | DAM bulk tests (pre-existing stages) | 🟡 tasks ✅ · projects/contents ❌ justified (§F) | **Tasks bulk status change added end-to-end (see §E); projects/contents bulk remain ❌ — no safe non-destructive domain action approved there (archive is destructive-adjacent; restore exists but bulk archive was not an approved decision)** |

### Export (LIST addendum decisions)

| Decision | Implementation | Evidence | Status | FINAL |
|---|---|---|---|---|
| CSV of all authorized filtered records, multi-sort preserved, per-field/row re-check, formula-injection safe, Persian-correct, bounded, audited | `ProjectController::export` + shared `listQuery()`; dialog in `WorkspaceList.tsx` | `ProjectsCsvExportTest` (2) | ✅ projects CSV | — |
| XLSX equivalent | `ProjectXlsxExporter` + `ProjectController::exportXlsx` + `GET /projects/export.xlsx` | `ProjectsXlsxExportTest` (PK workbook, filter respected, no `<f>` cells, 403) | ✅ (FINAL) | **Implemented natively (ZipArchive OOXML writer, all text as inline strings — formulas cannot execute), same scoping/audit/bound. Documented dependency review in final report.** |
| Exports for tasks/contents | — | — | ❌ | 🟡 stays (bounded to projects per approved sequence; architecture documented) — recorded as remaining gap, not silently dropped |

## B. UX‑DETAIL (DEC-01…11)

| ID | Decision | Routes/files | Status at 951b688f | FINAL |
|---|---|---|---|---|
| DEC-01 | Standard non-sticky detail header | `/projects/:id` `ProjectDetailView.tsx` | ✅ projects + contents (header scope) | **Content detail header aligned (breadcrumb/title/status/primary) — `ContentDetailView.tsx`** |
| DEC-02 | Back/breadcrumb at RTL start; title+status right; ONE primary far-left; More-actions menu (permission-checked, confirmed, audited) | `ProjectDetailView.tsx`; `ContentDetailView.tsx` header (breadcrumb, owner/updated meta, Ocean accent, primary tab state) | ✅ (contents header scope; existing permission-checked header actions preserved) | content body untouched |
| DEC-03 | Internal tabs don't change URL | projects ✅ (state-only tabs; inbound `?tab=` honored once) | 🟡 contents tabs audit | verified in matrix QA notes |
| DEC-04 | Overview = grouped Ocean cards, 2-col/1-col, no duplication | projects Overview cards exist (pre-existing) | ✅ projects | — |
| DEC-05 | Org quotas vs measured consumption separate; usage only from trustworthy backend | OrganizationDashboard (UX‑02‑2, C5 real limits; `storage_bytes` usage never displayed) | ✅ | untouched |
| DEC-06 | Activity ≤5 in Overview + full tab (actor/type/time/summary; old/new only expanded+authorized; ≠ security audit) | ProjectDetail Overview «آخرین فعالیت‌ها» + فعالیت‌ها tab | ✅ (verified visually) | — |
| DEC-07 | Edit model: inline small / Dialog short / dedicated page long / protected sensitive | project edit = Dialog; archive = ConfirmDialog | 🟡 (no dedicated long-form route; app pattern is dialogs — deviation recorded) | forms work in §C narrows this |
| DEC-08 | Preserve edits on recoverable errors | modal forms keep state on API error (`submitError`) | 🟡 partial (projects create) | extended by dirty-guard |
| DEC-09 | `lock_version` 409 never silently overwritten | tasks: `expected_status` 409 in `TaskOperations::changeStatus` ✅; projects: no lock_version field exists in domain | 🟡 | not fabricated — recorded precisely |
| DEC-10 | Explicit 403/404/409/validation handling | RouteEntity + error states (UX‑02‑1) | ✅ | — |
| DEC-11 | No destructive delete/restore unsupported by domain | archive/restore endpoints only where domain supports | ✅ | — |

Detail route coverage beyond projects: `/contents/:id` (ContentDetailView 1299 lines — header pattern applied, body not rewritten), task detail = drawer (`TaskDetailDrawer`, operational overlay, unchanged), user profile (`UserProfileView`, legacy — ❌ not migrated, recorded), organization/platform "detail" surfaces = dashboards + scoped settings (UX‑02‑2/C7, ✅ accepted scope).

## C. FORMS (F01…F08)

| ID | Decision | Evidence at 951b688f | Status | FINAL |
|---|---|---|---|---|
| F01 | Short forms in central Dialog | existing modal system | ✅ | — |
| F02 | Long forms on dedicated routes | app uses large modals for long forms (Create/EditProject 529/463 lines) | 🟡 deviation (recorded; no route refactor — would break AppContext modal ownership) | compensated by F03/F04/F06 inside the real forms |
| F03 | Autosave drafts for long forms | none | ✅ (FINAL) | **`useFormDraft` + restore/discard on CreateProjectModal + EditProjectModal (client-side, per-user keys, never server-persisted, sensitive fields excluded by construction — project forms carry no secrets)** |
| F04 | Dirty-exit guard: Save changes / Continue editing / Discard changes | none | ✅ (FINAL) | **Guard dialog on both project modals (X/backdrop close intercepted when dirty)** |
| F05 | Validate on blur + submit; server authoritative | submit-time field errors exist (CreateProjectModal `fieldErrors`); blur validation partial | 🟡 | unchanged (honest) |
| F06 | Multi-step only for genuinely complex flows | none | ✅ (FINAL) | **CreateProjectModal → 2 steps (الگو و اطلاعات پایه ← زمان‌بندی و اعضا) with per-step validation (the component serves create+edit, so both modes are stepped)** |
| F07 | Dependent fields clear stale selections | template change re-seeds fields (`handleTemplateChange`) | 🟡 | kept, covered by step validation |
| F08 | After create → record detail; duplicate-submit prevention; no risky autosave on short/sensitive | `CreateProjectModal` (`submitting` lock; success navigates to project detail via `setSelectedProjectId`+`setActiveView('project-detail')`); autosave long-form-only | ✅ | draft clears on successful create |

## D. Mandatory addendum

| Item | Status at 951b688f | FINAL verification |
|---|---|---|
| Sidebars all contexts (platform/org/personal WS/org WS) Ocean, RTL right, collapse + mobile drawer, ProfileDock, Escape-close | ✅ platform/org via typed config; workspace data-driven | **FINAL QA adds the personal-workspace sidebar context (mocked API, screenshots); platform/org shells were visually verified in the original UX-02-3 QA and are unchanged since** |
| Typed per-context nav config (key/title/icon/route/permission/eligibility/active matching) | ✅ platform/org (`app/shell/navigation.ts`); workspace nav remains data-driven in Sidebar (live collections — recorded rationale) | permission-hide vs backend-authoritative unchanged; ux021/ux023 gates |
| Non-operational modules never shown as working destinations | ✅ (nav items only map to real views/routes) | re-checked |
| `/select-environment`: no recents UI at all; large button cards (name, short type/role, icon, discreet active); whole-card + keyboard; search retained | ✅ | regression-checked in QA (recents count = 0) |
| Shared white PageSurface on `#F5F9FA` for selector/platform/org/WS/migrated pages; dialogs keep own presentation | ✅ selector, WorkspaceList, ProjectDetail, ScopedSettings, InvitationManager; dashboards background-consistency only (shell root) | grep+visual verification this pass; legacy unrouted views intentionally untouched |
| Security invariants (backend authz authoritative, K2, no secrets in URLs, audit preserved) | ✅ | bulk/XLSX reuse existing authorization + audit paths |

## E. FINAL implementations in this pass (exact locations)

1. **XLSX export** — `backend/app/Modules/Projects/Services/ProjectXlsxExporter.php` (native OOXML via ZipArchive; inline-string cells; RTL sheet view; bold header style; bounded 5,000 rows via same `listQuery()`), `ProjectController::exportXlsx`, route `GET /projects/export.xlsx`, CI PHP gains `zip` extension (enabling change only), frontend format choice in the existing export dialog, `ProjectsXlsxExportTest`. Guard: without ext-zip → 501 `xlsx_unavailable` (honest, never a broken file). Verified also by visual QA: format choice in the export dialog.
2. **Tasks bulk status** — `POST /tasks/bulk-status` (`TaskController::bulkStatus`) looping `TaskOperations::changeStatus` per record (per-record authorization, 409 tolerance per record, per-record audit already written by `changeStatus`), response `{updated, failed:[{id,code,reason}]}`; frontend selection column + page-only select-all + confirm dialog + outcome summary in `WorkspaceList.tsx` (tasks module only), cleared on any filter/page/sort change. `TasksBulkStatusTest`.
3. **Column reorder** — preference v2 `{hidden, order}` (pure helpers in `shared/api/columnPreferences.ts`, re-exported by `shared/api/preferences.ts`; legacy array read-compatible), ordered rendering in `WorkspaceList.tsx` (title/actions anchored), up/down + drag reorder in the column menu. ux023-final gates.
4. **Long-form support** — `shared/lib/formDraft.ts` (`useFormDraft`), `shared/ui/DirtyGuardDialog.tsx`; wired into `CreateProjectModal.tsx` (+2-step flow) and `EditProjectModal.tsx`; drafts per user+form(+record), restore banner, discard, clear-on-success.
5. **Content detail header** — `ContentDetailView.tsx` header aligned to DEC-01/02 pattern on `PageSurface` (body untouched).

## F. Remaining justified blockers (not silently dropped)

- XLSX for tasks/contents + queued async export for >5,000 rows: bound is the approved "bounded" behavior; async queue needs a job/export infrastructure decision (new authorization).
- Projects/contents bulk actions: no approved non-destructive domain action; not invented.
- F02 dedicated long-form routes & F05 full blur-validation: recorded deviations of the modal-owned form architecture; F03/F04/F06 delivered inside the real forms instead.
- `UserProfileView`, legacy unrouted views, DAM tables: outside the migrated set; DAM already has domain bulk + its own table system (COMPLETE in its domain).
- GitGuardian/independent security scan: still required; neutral ≠ pass.
