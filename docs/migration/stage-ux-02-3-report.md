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
