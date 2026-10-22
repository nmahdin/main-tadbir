# UX-02-1 Readiness Audit — ARCH-02 Acceptance Check + Preparation

**Stage:** ARCH-02 acceptance verification + UX-02-1 preparation (AUDIT ONLY — no implementation)
**Date:** 2026-10-19
**Branch:** `arena/582a70e5-main-tadbir` — **PR #14 remains OPEN; nothing merged, no production changes.**
**Audited HEAD:** `27139c7b9e5b74782805db1424775e07f303a3ca` (ARCH-02 final delivery HEAD)

> **Verdict:** ARCH-02 is exactly as delivered and is **ready for human acceptance testing on the
> user's Windows/Laragon machine** (checklist in §A6; local acceptance has NOT happened yet and
> awaits the user's results). UX-02-1 is **ready to implement** subject to the two product decisions
> in §B3 (K1 additive discovery endpoint, K2 environment semantics) and the user's approval.

---

## Part A — ARCH-02 acceptance findings (VERIFIED against the repository)

### A1. HEAD, working tree, PR state

| Item | Result |
|---|---|
| Local HEAD | `27139c7b9e5b74782805db1424775e07f303a3ca` — matches the delivery report |
| Remote HEAD (`origin/arena/582a70e5-main-tadbir`) | identical SHA (verified via `git ls-remote`) |
| Working tree | clean — 0 modified/untracked files |
| PR #14 | OPEN, unmerged (untouched by this audit) |

### A2. ARCH-02 audit document

`docs/architecture/arch-02-module-organization.md` (186 lines, committed) was reviewed and is
accurate: module map (14 modules), zones, exceptions E1–E7, frozen-edge ratchets, migration and
route compatibility sections, and the "what did not change" list all match the code at HEAD.

### A3. CI — all five product gates GREEN at the audited HEAD

Both workflow runs recorded at `27139c7b` show:

| Gate | Result |
|---|---|
| Backend contracts and tests (Pint + PHPUnit: 856 tests / 17,903 assertions) | ✅ SUCCESS |
| Frontend (node tests + typecheck) | ✅ SUCCESS |
| MySQL gate | ✅ SUCCESS |
| MariaDB 10.11 gate | ✅ SUCCESS |
| MariaDB 10.4-legacy gate | ✅ SUCCESS |

`.github/workflows/quality.yml` is byte-identical to the pre-ARCH-02 base (0-line diff — all
temporary diagnostic steps from the earlier Pint hunt were removed).

### A4. GitGuardian — NOT a real finding (integration/config skip)

- Check run `117924792969` on the final HEAD completed with status **neutral** ("skipping" in the
  PR view); **annotations_count = 0** — no secret, path, or line was reported.
- Title/summary: *"Could not complete scanning of your commits… Pull request too large to scan.
  This pull request exceeds the configured size limit, so GitGuardian skipped its scan to preserve
  the GitHub API rate limit budget."*
- **Conclusion:** an integration size-limit skip (PR #14 aggregates many stages), not a security
  finding and not a product gate.
- **Remediation (repository-admin action, not part of this audit):** run `ggshield` out-of-band
  against the branch before any future merge, raise the GitGuardian PR-size threshold, or split
  giant PRs per stage. The five product gates above remain the authoritative quality signal.

### A5. Compatibility verification

| Surface | Finding |
|---|---|
| Database migrations | 73 files across 28 roots; diff vs pre-ARCH-02 (`1e7a368`): **3 files, import-only repoints**; zero moves/renames; filenames, migration identifiers and logic unchanged — an existing `tadbir` database needs **no new migration and no destructive step** |
| API routes | route files changed by namespace repoints only; CI contract tests (route shapes) + module-structure uniqueness guards (123 literal route names) pass green |
| Ocean theme | canonical tokens at HEAD: `--color-primary: #39677c`, `--color-primary-hover: #2b5266`, `--color-background: #f5f9fa` — identical to the UX-02-1 requirement (single ocean theme; `/theme-previews` remains the visual source) |
| `/scoped-settings` | registered in `frontend/src/app/router/routes.ts` viewPaths; CORE‑UX‑FIX‑01.1 regression gates pass in the green frontend run |
| Demo seed | `SeedDemoData` unchanged (dev-only, idempotent): creates organization `demo-organization` + users `demo-owner`/`demo-member` when run locally (see §A6, step 6 — optional) |

### A6. Windows / Laragon acceptance checklist (existing `tadbir` DB — NON-destructive)

> Run on your machine, then send back the results. **Do NOT run `migrate:fresh`, `db:wipe`, or
> any fresh/seed command against the existing `tadbir` database.**

1. **Back up first:** in Laragon, export/snapshot the `tadbir` database (e.g. `mysqldump`), and
   confirm the DB server reports **MariaDB 10.4.32** (`SELECT VERSION();`).
2. **Update code:** `git fetch origin && git checkout arena/582a70e5-main-tadbir && git pull
   --ff-only` — expect fast-forward to this audit's commit (a documented descendant of `27139c7b`).
3. **Backend deps:** `cd backend && composer install --no-interaction` (locked deps; PHP **^8.3**
   per `composer.json`).
4. **Environment:** confirm `backend/.env` still points at your local `tadbir` DB
   (`DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_DATABASE=tadbir`, local
   credentials). Do not point it at any production database.
5. **Migrations:** `php artisan migrate:status` → **every migration "Ran", zero pending** (ARCH-02
   added none). If anything shows pending, STOP and report it — do not run destructive recovery.
6. **(Optional, local/dev only)** `php artisan tadbir:seed-demo` — idempotent; ensures the demo
   organization/users exist for the smoke below. Skip if you test with your own local accounts.
7. **Frontend:** `cd frontend && npm ci && npm run build`, then serve the app the way you usually
   do locally (Laragon vhost / `php artisan serve` + dev server).
8. **Smoke (existing behaviour):** log in → sidebar renders → **Dashboard**, **Projects**, **Tasks**
   open → **تنظیمات محدوده‌ای (Scoped Settings)** loads for the demo organization as `demo-owner`
   with its sections → log in as `demo-member` → organization administration stays denied
   (permission state, not a blank page) → open `/theme-previews` and confirm the single ocean theme.
9. **Report back:** pass/fail per step + any console/network errors. ARCH-02 acceptance is only
   recorded once these results come back — this audit does not claim them.

### A7. ARCH-02 blockers

- **Code Complete:** ✅ · **Dev-CI green:** ✅ · **Ready for human acceptance:** ✅ (this section)
- **Production Operationally Ready:** NO — unchanged blockers from earlier stages (PHP-CLI-via-cron
  scheduling, production MySQL version confirmation, backup/restore drill). Nothing in ARCH-02 or
  this audit changes production.

---

## Part B — UX-02-1 readiness audit

### B1. Current state (audited, file-level)

| Area | What exists today | Gap vs UX-02-1 |
|---|---|---|
| Session | `AuthProvider`/`useSession` (central) over `GET /auth/me`; payload = legacy user (id, name, username, role, **legacy permissions**, department, managed departments) | **No Core context**: no platform eligibility, no per-organization role, no membership data |
| Core context APIs | `GET /core/organizations` (active orgs, ACTIVE membership), `GET /core/workspaces` (active; owner or ACTIVE membership; `organization_id` nullable), already used via `features/settings/scopedSettingsApi.ts` | Summaries lack **my role per scope**; no platform-eligibility signal |
| Routing | `BrowserRouter`; standalone routes `/login`, `/theme-previews`, `/invitations/accept`, `/verify-email`, protected `/invitations/manage`; catch-all `*` → shell (`MainLayout`) with ActiveView switch; unknown paths **silently fall back to Dashboard** (CORE‑UX‑FIX‑01.1 behaviour) | No `/select-environment`; no true 404 page |
| Shell | `app/shell/Sidebar.tsx` (545 lines): RTL right sidebar, permission-filtered legacy nav, mobile slide-over drawer + overlay (`lg`), no tier footer | No collapse-to-icons, no profile dock, no environment awareness; ad-hoc `bg-indigo-600` classes instead of DS tokens |
| Context providers | `UIProvider` (view/route entity from URL, DAM modals), `AppProvider` (4,885-line legacy data context — exception E5) | No environment context; new state must NOT grow `AppContext` |
| Permissions (FE) | legacy permission strings from `/auth/me` drive nav/route guards | Org-scoped/platform authorization is server-side (C1 RBAC, C2 PlatformAuthorizer, C3 `OrganizationAccessGuard`) — environment gating must be data-driven from the server payload, never from legacy `hasPermission` |
| DS (Ocean) | `shared/ui/Primitives.tsx` (Button, Input, SearchInput, Badge, Tabs, Card, Skeleton family, EmptyState variants incl. no-permission/error, ErrorState, Modal/Drawer, PageHeader…), `shared/ui/Overlays.tsx` (DropdownMenu **already auto-flips upward** via `useFlip`, Popover, Tooltip) | Sufficient for UX-02-1 — no new primitives needed except one illustrated-state component |
| Errors | `shared/api/errors.ts`: `ApiError`/`ApiConnectionError`; fixed Persian copy for 0/401/403/404/419/422/429; 409 falls back to server `message` (codes exist: `stale_version`, `organization_unavailable`, …) | No illustrated 403/404/409/500/offline pages; no online/offline handling anywhere |
| Demo mode | `runtime.demoMode` short-circuits auth; demo fixtures in `shared/demo` | Environments must resolve from fixtures in demo mode (no network) |

### B2. Requirement → route / component / API mapping

| UX-02-1 requirement | Route | Components (DS-only) | API / data |
|---|---|---|---|
| Three environments | `/select-environment` (new standalone, `ProtectedRoute`, shell-less — mirrors `/invitations/manage`) | `SelectEnvironmentPage`, `Card`, `SearchInput`, `Badge`, `Skeleton`, `EmptyState` (no-results/search) | `GET /core/environments` (proposed, §B3-K1) or client-side combine of `/core/organizations` + `/core/workspaces` + platform probe |
| Platform environment | shell variant (nav frame only — dashboards are UX-02-2) | `Sidebar variant="platform"` | platform permissions from payload (server `PlatformAuthorizer` plane) |
| Organization Management | shell variant + existing `/scoped-settings` & `/invitations/manage` with org preselected | `Sidebar variant="organization"` | org membership role from payload |
| Workspace env (personal / org) | current `MainLayout` + `/scoped-settings` workspace preselected | `Sidebar variant="workspace"` | `/core/workspaces` (`organization_id` distinguishes personal vs org) |
| Collapse-to-icons (desktop, RTL) | — | `Sidebar` width toggle + `Tooltip` labels; preference in `localStorage` | client-only |
| Mobile RTL drawer | — | existing aside/overlay pattern, DS tokens | client-only |
| Profile dock, menu opens upward | — | dock pinned at sidebar bottom; `DropdownMenu` (auto-flip already implemented) | `/auth/me` identity; logout via existing `authApi` |
| Recent environments | `/select-environment` | `Card` list ("اخیراً استفاده‌شده") | `localStorage`: kind+id+timestamp **only**; validated against fresh payload; unavailable ids dropped silently |
| Secure switching | — | `FullPageLoader` during switch; recoverable `ErrorState` (retry, stay on current env) | `queryClient.removeQueries()` on switch (never `invalidateQueries` — preserves CORE‑UX‑FIX‑01.1 `skipToken` no-fetch contract); selection is UI state only — **no new context header/token**; backend re-authorizes every request as today |
| Illustrated states | catch-all inside shell (deliberate change: unknown path → 404 page instead of silent dashboard fallback) + route guards | new `IllustratedState` (ocean wave/compass inline SVG in canonical tokens) + `EmptyState` variants → `ForbiddenState` 403, `NotFoundState` 404, `ConflictState` 409, `ServerErrorState` 500, `OfflineState`, `InvalidContextState` | `parseApiError`/error `code` mapping (extends copy, no contract change); `useOnlineStatus` hook + `ApiConnectionError` (status 0) |
| Ocean only | — | canonical tokens (`#39677C` / `#2B5266` / `#F5F9FA`); no new `--color-*` definitions outside the two E6 CSS homes (arch02 guard enforces) | — |

### B3. Conflicts with C1–C7 contracts — and the smallest resolutions

- **K1 — No discovery payload (DECISION NEEDED).** `/auth/me` is legacy-plane only and the two Core
  list endpoints don't return the caller's role per scope or platform eligibility. A `/select-
  environment` page built only from them would render roles wrong and guess at platform access.
  *Smallest safe resolution:* one **additive, read-only** `GET /core/environments` built from the
  existing organization/workspace queries + a platform-permission probe, behind the existing
  authorizers. No C1–C7 behaviour changes; covered by new PHPUnit tests (401/403 boundaries,
  suspended/ended org exclusion per C3, membership boundaries). **Needs PO approval** (it is the
  only backend addition in the plan).
- **K2 — "Workspace environment" semantics (DECISION NEEDED).** C1–C7 do not scope legacy
  operational data (projects/tasks/content) by Core workspace; that arrives with later roadmap
  stages. Selecting a workspace in UX-02-1 therefore means a **navigation/authorization context**
  (sidebar variant, scoped-settings preselection, future Core surfaces) — it must NOT claim to
  filter legacy views. Copy and acceptance criteria must reflect this framing.
- **K3 — Unavailable environments.** C3 lifecycle means suspended/ended organizations disappear
  from lists by design. Recents/deep links to them resolve to the **invalid-context** illustrated
  state; stale recent ids are dropped. No contract change.
- **K4 — Platform content depth.** Platform administration has backend APIs (C2/C3/C5) but few
  dedicated screens; Scoped Settings' Platform tab is honestly empty today. UX-02-1 ships the
  environment **frame and navigation to existing surfaces only**; dashboards remain UX-02-2.
- **K5 — Cache isolation vs CORE‑UX‑FIX‑01.1.** Isolation uses `removeQueries()` (entries dropped,
  nothing refetched); `skipToken` cache-only queries can never be turned into fetches by a switch.
  The `uxfix011` gate must stay green.
- **K6 — 404 vs silent dashboard fallback.** Adding a real 404 page deliberately replaces the
  catch-all fallback for unknown paths. Known views stay identical; the `uxfix011`/`arch02` gates
  are re-asserted, not weakened.
- **K7 — DS discipline.** Sidebar's ad-hoc indigo classes are replaced by semantic tokens/DS
  components in the same files; the E6 token confinement and E7 composition guards stay enforced.
- **K8 — Demo/Bale entry flows.** `demoMode` resolves environments from fixtures without network;
  Bale panel token entry (`returnTo`) is untouched.
- **K9 — Security.** Persistence stores identifiers only (no names/emails/tokens); environment
  selection never becomes an authorization input — every API call remains authorized server-side
  exactly as today.

### B4. Smallest safe implementation sequence (for a contractor)

1. **S0 — Approvals:** PO confirms K1 (additive endpoint) + K2 (context-not-data semantics).
2. **S1 — Backend:** `GET /core/environments` + PHPUnit (boundaries, C3 exclusions, platform probe).
   No frontend change; all existing gates stay green.
3. **S2 — Environment context:** `app/providers/EnvironmentContext.tsx` (React Query payload,
   selection + recents in `localStorage`, switch = `removeQueries` isolation, loading/error
   handling) + node tests. `AppContext` untouched.
4. **S3 — `/select-environment`:** full page (search, grouped cards, recents) on DS primitives.
5. **S4 — Shell variants:** three sidebar variants, desktop collapse-to-icons, mobile RTL drawer,
   profile dock with upward `DropdownMenu`; canonical tokens only.
6. **S5 — Illustrated states + offline:** `IllustratedState` family, 403/404/409/500/offline/
   invalid-context wiring, catch-all → 404 page, `useOnlineStatus`.
7. **S6 — Integration + gates:** Scoped Settings preselects the environment scope (small, optional
   chaining; default behaviour unchanged), full frontend/backend suites + five CI gates, smoke §B5.

### B5. Testing plan

- **Backend (PHPUnit, CI):** environments endpoint — auth required; member/non-member boundaries;
  suspended/ended orgs absent (C3); workspace owner vs member vs outsider; platform eligibility
  agrees with `PlatformAuthorizer`; no legacy regression (856-test suite stays green).
- **Frontend (node tests + typecheck + build, CI):** new `ux021` suite (grouping personal vs org
  workspaces, search filtering, recents ordering + stale-id drop, switch isolation calling
  `removeQueries` and never invalidating `skipToken` queries, 403/404/409/500/offline selection by
  status+code); `uxfix011`, `arch02`, phase suites all green.
- **Manual smoke (Windows/Laragon, after §A6):** demo-owner login → environment picker lists
  Platform (if eligible), demo organization, demo workspace → switch each way (loading state,
  no cross-environment leftovers) → demo-member: platform/org-admin entries absent or 403 page,
  never blank → break connectivity → offline state with retry → unknown URL → illustrated 404 →
  deep link into suspended org (if fixture exists) → invalid-context state.

### B6. Verified vs proposed

- **Verified in this audit (repository facts):** everything in Part A, and the current-state facts
  in §B1/§B2 "What exists today" (file/API-level, at HEAD `27139c7b`).
- **Proposed (needs approval, NOT implemented):** `GET /core/environments` (K1), the environment
  semantics framing (K2), the `/select-environment` route, sidebar variants, illustrated states,
  and the S1–S6 sequence. **No UX-02-1 code was written; no merge, deployment, or production
  change occurred. Local (Windows/Laragon) acceptance has NOT been performed — §A6 awaits the
  user's results.**

---

## STOP — approval gate

Work stops here. Awaiting: (1) ARCH-02 acceptance results from §A6, and (2) approval of K1/K2 and
the S1–S6 sequence before any UX-02-1 implementation begins.
