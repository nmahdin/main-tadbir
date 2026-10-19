# ARCH-02 — Complete Modular Codebase Reorganization

Branch `arena/582a70e5-main-tadbir` (PR #14, open/unmerged). Builds
directly on the ARCH-01 conventions (`DomainPaths`, Core domains,
business-module manifests, thin route registrar) — no competing
architecture was introduced. All moves are mechanical and
behavior-preserving: namespaces/imports changed, logic did not.

## 1. Audit summary (before → after)

### Backend (`backend/app`, PHP files by zone)

| Zone | Before | After | Note |
|---|---|---|---|
| `Core/*` (C1–C7 domains) | 166 | 168 | +2 Mail classes moved to their Core owners |
| `Modules/*` | 3 | 130 | legacy plane relocated here (114 files) |
| `Http` | 89 | 53 | Api/V1 domain controllers moved to modules; Core/Platform HTTP adapters + Middleware/Requests/Resources remain (exception E3) |
| `Models` | 37 | 37 | retained shared legacy data layer (exception E1) |
| `Services` | 45 | 0 | emptied into module `Services/` |
| `Bot` | 25 | 0 | `Modules/Messaging/Bot/Bale` |
| `Support` | 7 | 0 | module `Support/` + `Shared/Calendar` |
| `Events`/`Observers`/`Rules`/`Mail` | 5 | 0 | moved to owning modules/Core domains |
| `Console`, `Providers`, `Shared` | 7 | 8 | app-level commands/provider retained (E4); +`Shared/Calendar` |

New legacy-plane modules (file counts): Messaging 36, Contents 24,
Dam 12, Administration 11, Projects 10, Identity 7, Integrations 6,
Tasks 5, Departments 4, Notifications 4, Secretariat 4,
Collaboration 3, Meetings 3, Reference 1 (fixture). Each carries a
`*Module.php` manifest (no new permission keys — ownership stays
in the Core/legacy catalogs) and `Database/Migrations|Seeders`
folders, and is registered in `DomainPaths::BUSINESS_MODULES`.

### Frontend (`frontend/src`, 210 files)

| Zone | After |
|---|---|
| `app/` (App.tsx, providers, router, shell) | 13 |
| `features/*` (21 features) | 121 |
| `shared/*` (ui, api, queries, lib, config, demo, types) | 74 |
| `styles/index.css`, `main.tsx` | 2 |

`components/<domain>` → `features/<domain>` (content→contents;
auth/users/roles→identity; chat/bale→messaging; legacy settings→
`features/settings/legacy`), `components/common` → `shared/ui`,
`components/layout` → `app/shell`, `api` → `shared/api`,
`queries` → `shared/queries`, `utils` → `shared/lib`, `config` →
`shared/config`, `demo` → `shared/demo`, `routing` → `app/router`,
`context` → `app/providers`, `types.ts` → `shared/types.ts`,
`index.css` → `styles/index.css`. 194 files moved; every relative
import and every test path literal was rewritten through the
old→new map (228/228 tests, typecheck, build verified locally
before commit).

## 2. Ownership conventions (final)

- **Core domains** (`app/Core/<Domain>`) own the C1–C7 platform:
  Identity, Rbac, Organizations, Workspaces, Memberships,
  Authorization, Platform, Modules, Plans, Subscriptions,
  Settings, Invitations, Audit. Core never depends on
  `App\Modules` or `App\Integrations` (existing guard).
- **Business/legacy modules** (`app/Modules/<Module>`) own their
  controllers (`Http/Controllers`), services (`Services`),
  support (`Support`), events/observers, and future
  `Database/Migrations|Seeders`. Cross-module imports may target
  another module's `Services`/`Support`/`Events`/`Models` only —
  never its `Http\Controllers` (guarded; see §4).
- **Frontend features** (`src/features/<feature>`) own pages and
  feature components; `src/shared/*` is feature-agnostic
  (UI primitives, api client/queries infra, lib, config);
  `src/app/*` is the shell (providers, router, layouts).
  Feature code imports shared/app layers, not other features'
  internals (guarded; the pre-existing feature-composition edges are
  frozen by an allowlist, see E7). One genuine shared→feature leak
  found by the new guard was fixed by promoting the repository
  FolderBrowserModal (a props-driven folder picker used by five
  features) from features/dam to shared/ui.

## 3. Documented exceptions (intentionally retained)

- **E1 — Legacy Eloquent models stay in `app/Models`.** They are
  the shared data layer of the legacy plane (298 referencing
  files; `User` alone 201, incl. `config/auth.php`), are used by
  Core auth, and their stored polymorphic types are short strings
  (`content`, `task`, …), so relocation would be a 298-file
  namespace-only change with zero behavioral benefit and real
  upgrade risk. Future per-module model moves should ride along
  with the module's next functional change. (Same reasoning
  ARCH-01 applied to historical migrations, which also stay in
  `database/migrations`; new migrations belong to the owning
  module's registered `Database/Migrations` path.)
- **E2 — Legacy-plane module service graph is cyclic.** Contents,
  Tasks, Projects, Dam and Meetings services collaborate in both
  directions (pre-existing design, e.g. `TaskOperations` ↔
  `ContentPublication`). ARCH-02 made every such reference an
  explicit `use` import (216 injected) instead of hiding it; it
  did not redesign the collaborations. New code must not add
  cross-module cycles outside this registered legacy set.
- **E3 — Core/Platform HTTP adapters** stay in
  `app/Http/Controllers/Api/V1/{Core,Platform}` and legacy
  `Middleware`/`Requests`/`Resources` stay in `app/Http`:
  they are the framework HTTP layer for Core domains whose routes
  already live in domain route files (ARCH-01). The base
  `Controller.php` stays per Laravel convention.
- **E4 — `app/Console/Commands`** keeps the application commands
  (`tadbir:seed-essential`, `tadbir:seed-demo`, platform-operation
  commands): artisan commands are application entry points, and
  the seed commands' environment guards are pinned by tests.
- **E5 — Frontend `AppContext.tsx`** (4 885 lines) remains the
  legacy workspace state provider in `app/providers`. Splitting
  it is a behavior-risking refactor explicitly out of ARCH-02's
  mechanical scope; it shrinks as views migrate to the query
  hooks (`shared/queries`). Demo fixtures live in `shared/demo`
  and stay lazily imported (pinned by performance tests).
- **E6 — Theme tokens** have exactly two homes: `src/styles/
  index.css` (`:root` canonical Ocean tokens) and the canonical
  preview's `uiShowcaseThemes.css` mapping (the `/theme-previews`
  reference surface). No feature may define `--color-primary`
  (guarded).
- **E7 — Registered frontend feature compositions.** Thirteen
  pre-existing feature→feature compositions (e.g. settings embedding
  the legacy activity/dam/messaging panels, task/content screens
  embedding the calendar-kind icon and the DAM library) are frozen
  in `frontend/tests/arch02.test.mjs` as an explicit allowlist that
  may only shrink. New cross-feature imports fail the guard:
  promote the shared piece to `src/shared` or compose in `src/app`.
  Two deliberate boundary repairs were made instead of registrations:
  the last-active-admin invariant moved to Core (backend E2/E3
  companion fix in `LastActiveAdminGuard`), and `FolderBrowserModal`
  was promoted to `shared/ui`.

## 4. Automated guards added

Backend (`tests/Unit/Architecture/ModularStructureTest` +
`DependencyRulesTest` updates):
- Legacy global zones (`app/Services`, `app/Bot`, `app/Support`,
  `app/Events`, `app/Observers`, `app/Rules`, `app/Mail`) must not
  reappear; new code lands in modules/Core/Shared.
- Every `app/Modules/*` directory is registered in
  `DomainPaths::BUSINESS_MODULES` (and vice versa) with manifest +
  Database folders.
- PHP namespace of every `app/**` file matches its PSR-4 path.
- Migration files exist only in `database/migrations` or a
  registered module/Core `Database/Migrations` path; basenames
  unique across all registered paths.
- Route names are unique across the registered route table.
- Cross-module imports never target another module's
  `Http\Controllers`.

Frontend (`tests/arch02.test.mjs`):
- No file under `src/` imports the retired zones
  (`components/`, `../api/`, `../context/`, …).
- Features do not import other features' internals except the
  documented composition allowlist; `shared/*` imports no feature.
- The src import graph is acyclic.
- `--color-primary` is defined only in the two E6 homes.
- (Existing `uxfix011` gate keeps every navigable view routed,
  incl. `/scoped-settings`.)

## 5. Registration evidence

- Routes: `routes/api.php` unchanged as thin registrar; domain
  route files unchanged; controllers resolve through the same
  `Route::` statements (only their class namespaces moved, and
  the FQCN rewrite covered routes/tests/config). Route-name
  uniqueness is asserted by the new guard.
- Migrations: no file moved; `DomainPaths::migrationPaths()`
  order unchanged (history first); new module paths registered
  after existing ones and currently empty (`.gitkeep`), so fresh
  installs and upgrades see an identical migration set.
- Composer: PSR-4 `App\ → app/` already covers every new
  namespace; no composer.json change was needed.

## 6. Known remaining issues

- E1/E2/E5 above are deliberate deferrals, tracked here.
- The legacy `SettingsView`/`IntegrityView` live under
  `features/settings/legacy` beside the Core scoped-settings
  feature; renaming the legacy feature is a product decision,
  not a mechanical one.
- `app/Http/Requests` and `app/Http/Resources` (legacy plane)
  remain global HTTP-layer folders under E3; per-module Requests
  should be adopted with the next functional change per module.
