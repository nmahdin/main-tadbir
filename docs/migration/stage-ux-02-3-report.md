# Stage UX‑02‑3 — List, Detail & Form Experience Redesign — Delivery Report

Branch: `arena/582a70e5-main-tadbir` · PR #14 remains **OPEN and unmerged** (no merge performed).
Route inventory: `docs/migration/ux-02-3-route-inventory.md` (committed first, `a260ed29`).

## Verdicts

- **Code Complete:** YES for the scope below (bounded stages A–D + addendum + targeted detail migration).
- **Security Verified:** NO — GitGuardian/independent scan still required before any merge; backend authorization was preserved and re-tested, not re-audited.
- **Dev‑CI Ready:** YES — all five gates (Backend contracts, Frontend, MySQL, MariaDB, MariaDB 10.4‑legacy) **SUCCESS** at head `30d3bf37`; GitGuardian completed **neutral/skipped**, which is not a security pass.
- **Production Operationally Ready:** NO.
- **ARCH‑02 local Windows/Laragon acceptance:** still NOT performed/not claimed. The existing `tadbir` database was never touched; no migrations were added or run.

## What shipped (bounded commits, in order)

| Commit | Scope |
|---|---|
| `a260ed29` | docs: route inventory + bounded migration plan |
| `f765e1f6` | Stage A backend: multi-column sorting — `sort=field:asc,field2:desc` in shared `WorkspaceListRequest` (per-module allowlist: `created_at/updated_at/deadline` + `priority` for projects/tasks; unique fields, ≤3, validated directions), applied by Project/Task/Content controllers with a stable `id` tiebreaker; legacy `sort`+`direction` untouched. 3 Feature tests (precedence, legacy compat, hostile specs → 422 incl. `contents?sort=priority:asc`) |
| `ae657631`, `c014cfe0`, `300928be` | Stage A frontend: `parseSortSpec/serializeSortSpec/cycleSortField` in `listQuery.ts` (URL stays the single source of truth; spec drops stale `direction`), numbered `Pagination` (`pageWindow`, first/last + current±1 + ellipsis), shared `PageSurface`, shell background → `--color-background` |
| `a69a01e0` | Column-preference backend: new presentation-only C7 definition `user.experience.list_columns` (string/JSON, user scope, `userOverride`) + registry catalog pin extended deliberately + per-user round-trip tests |
| `0180dbba` | Stage B: `WorkspaceList` Ocean migration — indigo/violet replaced by canonical Ocean tokens, `PageSurface`, RTL filter **drawer** (draft → Apply writes URL; Clear resets draft; reopening preserves values; Escape/backdrop close), removable filter chips (multi-sort chip shows precedence), sortable headers with precedence badges, mobile entity cards (`md:hidden`, no horizontal overflow), kanban/calendar/cards preserved |
|  | Column visibility: per-module hideable columns (title/actions mandatory), persisted per user+list via C7 preference (`shared/api/preferences.ts`, version-checked writes, restore-defaults); visibility never affects API data |
| `8b350f95` | Stage D backend: `GET /projects/export` CSV — reuses the **same** `listQuery()` scoping/filters/multi-sort as the index (identical authorization incl. 04B context firewall), allowlisted columns (`columns` param validated in `WorkspaceListRequest`, projects-only), streamed, hard 5,000-row bound, UTF‑8 BOM, formula-injection neutralization (`'`-prefix), `projects_exported` activity audit (row count/columns/filter keys only). 2 Feature tests |
| `781617c0` | Stage D frontend: «خروجی CSV» dialog (defaults = currently visible columns; does not mutate saved prefs; explains all-filtered scope + 5,000-row bound) + session-safe `downloadRequest` in the API client |
| `6dc4325a` | Addendum §2: `/select-environment` — Recently Used section/cards **completely removed**, large button-like cards (min‑height, name + short type·role line + icon + discreet «محیط فعلی»), `PageSurface` shell; switching/persistence/provider untouched. UX‑02‑1 gate updated to assert the new contract |
| `f57c4e1d` | Addendum §1: all sidebars Ocean-tokenized; typed navigation config `app/shell/navigation.ts` (key/id/title/icon/kind/view|path/permission/contexts/section/order + `isShellNavActive`); organization & platform shells render from config with identical DOM ids, labels, destinations |
| `40c1ef2c` | Stage C: `ProjectDetailView` — `PageSurface`, breadcrumb at RTL start, title + status + priority in header, **one primary action** at the far-left (تسک جدید, fallback ویرایش پروژه) + secondary «عملیات» menu (archive still behind its ConfirmDialog), internal tabs now **state-only** (`?tab=` honored once on entry, switching never rewrites the URL) |
| `aa2acb90` | `PageSurface` adoption: Scoped Settings, Invitation Manager (Ocean background + surface shadow) |
| `c6fef7fb` | Tests: `ux023` gates (multi-sort semantics incl. hostile input, drawer/mobile/columns/export source gates, addendum gates) |
| `bdc49fdc` | Laragon `frontend/dist` rebuild |
| `caeb9d97` | Pint `ordered_imports` fix in ProjectController (CI-diagnosed; TEMP workflow diagnostics fully reverted — workflow byte-identical to base, md5-verified) |
| `30d3bf37` | Test-contract alignment: registry-sync in the preference test, deliberate 7-definition sync count, preference key list extended, resource string ids cast in the multi-sort assertion |

Three pre-existing source-gate tests that pinned the *superseded* UX (inline filter panel, single-sort dropdown, filters-bound panel fields) were retargeted to the UX‑02‑3 structures (`requestedFixesRegression`, `workspaceUiRegression`, `projectArchiveDamRegression`) — no assertion about business behavior was dropped.

## Verification (local, actually run)

- `npx tsc --noEmit` — CLEAN.
- `npm test` — **258/258 PASS** (252 prior + 6 new UX‑02‑3 gates).
- `npm run build` — PASS (dist committed `bdc49fdc`).
- PHP: no PHP runtime in the sandbox; new/changed PHP passed JS php-parser syntax checks. PHPUnit/Pint execute only in CI — **not claimed locally**.
- Visual QA (headless Chromium, mocked server payloads — dev-only fixtures, no real records): selector without recents at 1440/834/390; WorkspaceList desktop table + sortable headers (1440), mobile cards (390), filter drawer with multi-sort editor (1440), CSV export dialog (1440), organization shell + PageSurface (1440), project detail header/tabs (1440). No horizontal overflow at any width; no page errors. UX‑02‑2 dashboards untouched (background now canonical `--color-background` via the shell root).
- CI: first backend run failed on Pint `ordered_imports` + four assertions in the new tests themselves (registry sync contract, catalog counts, string ids) — all fixed in `caeb9d97`/`30d3bf37` without touching application behavior; final five gates green (see Verdicts).

## Deferred / blocked (explicit, not fabricated)

- **XLSX export** — no spreadsheet package exists in `backend/composer.json`; the sandbox cannot reach Packagist to regenerate the lock file. CSV (Excel-compatible, BOM) ships; XLSX waits for a dependency-approved environment.
- **Bulk actions** — the backend has no bulk endpoints or defined business semantics; per DEC‑09 nothing was fabricated (no fake select-all/bulk bar).
- **Form autosave drafts, dirty-guard, multi-step** — create/edit lives in AppContext-owned modals without draft storage; deferred rather than bolting risky autosave onto short forms (F01/F08 prohibit risky autosave).
- **Column drag-reorder** — visibility + restore-defaults shipped; reorder deferred.
- **Contents/Tasks CSV** — export architecture is shared (same request/allowlist pattern); projects ships first per plan.
- Legacy `ProjectListView` / `DamDataTables` client-side tables, `UserManagementView`, and detail tabs' bodies were not rewritten (inventory documents why); overview activity duplication and 409 `lock_version` form handling belong to the form stage above.

## Laragon smoke checklist (user-run, Windows)

1. `git pull` this branch; confirm `frontend/dist` is current (`bdc49fdc`) and backend code is at the same head; run `php artisan route:list --path=projects/export` → route listed.
2. Log in → `/select-environment`: **no** «اخیراً استفاده‌شده» section; large cards; switch personal workspace ↔ organization ↔ platform; switching still preserves data context behavior (K2).
3. `/projects`: Ocean table; open «فیلترها» drawer, pick وضعیت + two sort criteria (e.g. اولویت صعودی، سررسید نزولی) → «اعمال فیلترها» → URL shows `sort=priority:asc,deadline:desc`, page resets to 1; chips removable; switch to 390px width → cards, no horizontal scroll.
4. «ستون‌ها»: hide «سررسید», reload on another device/browser → stays hidden; «بازگردانی پیش‌فرض ستون‌ها» restores.
5. «خروجی CSV»: choose columns → download opens in Excel with correct Persian; file includes all filtered projects; audit: `activity_logs` has a `projects_exported` row.
6. Open a project: breadcrumb/title/status/priority header, «تسک جدید» primary + «عملیات» menu; switch tabs → URL does **not** gain `?tab=`; sidebar (workspace + organization + platform) is Ocean teal; dashboards unchanged in data.
7. Confirm the `tadbir` database schema is untouched (no new migrations in this stage).

## Stopping point

UX‑02‑4, UX‑03 and WEB‑CMS‑01 were **not** started. Awaiting human acceptance of UX‑02‑3.

---

# UX-02-3-FINAL addendum — Approved Decision Compliance and Completion

Delivered after the compliance audit (full decision→route→file→test matrix: `docs/migration/ux-02-3-final-compliance-matrix.md`). **Final acceptance is NOT declared here; it remains the user's explicit decision.**

## Gaps closed in this pass

1. **XLSX export (was ❌)** — `backend/app/Modules/Projects/Services/ProjectXlsxExporter.php` writes a real OOXML workbook with PHP's bundled ZipArchive (no new composer dependency — the lock file cannot be regenerated in the sandbox; documented dependency review: `composer.json` carries no spreadsheet package and `zip` was added to the CI PHP extension set as the only enabling change). All cell values are inline strings, so formula execution is impossible by construction; the sheet view is RTL and headers use the Ocean accent. `ProjectController::exportXlsx` reuses the exact CSV scoping (`listQuery()`, 5,000-row bound, `projects_exported` audit with `format: xlsx`); without ext-zip the endpoint answers an honest `501 xlsx_unavailable`. The export dialog now offers CSV/XLSX. Evidence: `ProjectsXlsxExportTest` (valid PK workbook, filter respected, no `<f>` formula cells, permission 403, honest skip without ext-zip).
2. **Tasks bulk status (was ❌)** — `POST /tasks/bulk-status` loops the existing `TaskOperations::changeStatus` per record, so per-record authorization, content-review semantics, 409 handling and audit are identical to the single-record path; the response reports `{updated, failed[{id, code, reason}]}`. Frontend: page-only selection (select-all labeled «همهٔ وظیفه‌های این صفحه», cleared on any filter/sort/page/view change), confirmation dialog, per-record outcome summary. Projects/contents bulk remains unimplemented by design — no approved non-destructive domain action exists there (§F of the matrix). Evidence: `TasksBulkStatusTest` (own updated+audited, foreign 403 untouched, missing 404, validation 422, no-permission 403); browser flow verified end-to-end.
3. **Column reorder (was 🟡)** — the C7 preference `user.experience.list_columns` becomes v2 `{hidden, order}` per module (v1 arrays remain readable; writes stay version-checked). The column menu offers drag + ↑/↓ controls; rendering follows the stored order with عنوان/عملیات anchored. Pure helpers in `shared/api/columnPreferences.ts` are unit-tested (`frontend/tests/ux023final.test.mjs`); the reorder was verified live (سررسید moved before اولویت/مدیر پروژه).
4. **Long forms (F03/F04/F06 were ❌)** — `shared/lib/formDraft.ts` (per-user keys `tadbir:draft:{userId}:{key}`, debounced autosave, restore/discard/clear-on-success) + `shared/ui/DirtyGuardDialog.tsx` wired into the mounted `CreateProjectModal` (create+edit) and the legacy `EditProjectModal`; `CreateProjectModal` is now two steps (الگو و اطلاعات پایه ← زمان‌بندی و اعضا) with per-step validation. Browser-verified: dirty → guard → «ذخیره و ادامه» → reopen → restore banner → values restored.
5. **Content detail header (was 🟡)** — `ContentDetailView.tsx` now sits on `PageSurface` with the DEC-01/02 header (Ocean accent bar, مسیر صفحه breadcrumb, title/status, owner + آخرین به‌روزرسانی + مهلت نهایی meta, primary tab state). Body untouched.

## Verification

- Frontend: typecheck clean; `npm test` **263/263** (258 baseline + ux023final gates); production build regenerated `frontend/dist`.
- Backend: `Backend contracts and tests` green in CI (sqlite job) incl. both new test classes; three migration gates (MySQL, MariaDB, MariaDB 10.4 legacy) green; `frontend` gate green; GitGuardian **neutral** (not a security PASS — independent scan still required before merge).
- Visual QA (headless Chromium, honestly mocked API payloads, no real records): projects list + column menu (drag handles, arrows, persistence hint) + export dialog with XLSX selected at 1440; tasks bulk bar → confirm → outcome report at 1440; create-project steps 1→2 + dirty guard + draft restore at 834; content detail header at 1440; projects at 834/390 with no horizontal overflow. The personal-workspace sidebar context is covered by this pass; platform/organization shells were verified in the original UX-02-3 QA and are unchanged.
- Two CI iterations were needed for Pint style on the new PHP (import order; `not_operator_with_successor_space`) — fixed from Pint's own autofix diff via temporary diagnostic steps; the workflow file was then restored byte-identical (md5 `26d1e920…`).

## Still open (not fabricated)

Tasks/contents export, projects/contents bulk, F02 dedicated long-form routes / F05 full blur validation (recorded deviations), async export beyond 5,000 rows, ARCH-02 Laragon acceptance, independent security scan. UX-02-4 / UX-03 / WEB-CMS-01 not started.

## Laragon acceptance checklist (FINAL increments)

1. `php artisan route:list --path=projects/export` shows both `export` and `export.xlsx`; same for `tasks/bulk-status`.
2. `/projects` → «خروجی»: choose Excel (XLSX) + columns → the downloaded workbook opens in Excel with Persian headers, values as text; `activity_logs` gains `projects_exported` with `format: xlsx`.
3. `/tasks`: select two tasks on the page → bulk bar appears → pick وضعیت مقصد → confirm → outcome summary lists updated/failed per record; switch page → selection is gone.
4. «ستون‌ها»: drag «سررسید» above «اولویت» (or use arrows) → order persists after reload and on a second browser/device with the same account.
5. «ایجاد پروژه جدید»: fill step 1 → «مرحلهٔ بعد» → press «انصراف» → guard offers ذخیره و ادامه / حذف پیش‌نویس / ادامهٔ ویرایش; choosing ذخیره و ادامه, then reopening create, shows the restore banner and restores the typed name.
6. Open any content record: header shows breadcrumb (محتواها ← title), owner, آخرین به‌روزرسانی on the white PageSurface; tabs switch without changing the record body behavior.

## Acceptance record (2026-10-19)

**The user accepted UX-02-3 / UX-02-3-FINAL after their Laragon review (human UX-02-3 acceptance).** This closes the UX-02-3 acceptance gate only. Still open and unaffected: the independent security scan (required before PR #14 merge) and the ARCH-02 infrastructure/Laragon acceptance. PR #14 remains open and unmerged.
