# ARCH-01 — Modular Repository Organization & Development Demo Data

Status: implemented on `arena/582a70e5-main-tadbir` (PR #14, open,
unmerged). Production untouched. This document is the audit, the
target-layout map, and the standing rules for future work.

## 1. Before (audit at HEAD `2f4b617`)

| Area | Before |
|---|---|
| Migrations | ALL 72 migrations flat in `backend/database/migrations` (legacy 2026_09 + Core 2026_10_15_000001–000016). Order is filename-determined; DB `migrations` table records basenames. |
| Seeders | `backend/database/seeders` (legacy `DatabaseSeeder` = required access data only; opt-in `CoreRbacSeeder`, `CoreWorkspaceSeeder`). |
| Factories | `backend/database/factories` (User + Core scope factories). |
| Routes | One 447-line `backend/routes/api.php` mixing legacy product routes with Core (03A/03B/C2-3/C4-3/C5-4/C6-3) blocks; `web.php` small; `console.php` holds scheduling closures. |
| Providers | `bootstrap/providers.php` → `AppServiceProvider` + `App\Core\Modules\ModuleServiceProvider` (all Core container bindings). |
| Frontend | Flat SPA: `src/App.tsx` router monolith, `src/api/*` clients, `src/components/*` by surface, `src/invitations/*` (C6), `src/{auth,config,context,utils}` shared. Tests import `../src/...` paths directly. |
| Architecture checks | `tests/Unit/Architecture/DependencyRulesTest` (cross-module contract imports) + stage test suites. |

## 2. Target layout (after ARCH-01)

```
backend/app/Core/{Domain}/           Audit, Authorization, Identity, Invitations,
  Database/Migrations/               Memberships, Modules, Organizations, Plans,
  Database/Seeders/                  Platform, Rbac, Settings, Subscriptions,
  Routes/ (where the domain owns    Workspaces
           HTTP surface)
backend/app/Modules/{Module}/        Projects, Reference
  Database/Migrations/
  Database/Seeders/
backend/app/Core/Architecture/DomainPaths.php   deterministic registries
backend/database/migrations/         HISTORICAL migrations — unchanged location
backend/routes/api.php               thin registrar (legacy routes + Core requires)
frontend/src/features/invitations/   C6 invitation feature (api, logic, session, pages)
frontend/src/app/App.tsx             SPA router component (entry stays src/main.tsx)
```

### Migration compatibility assessment (why history does not move)

Laravel records applied migrations by **basename** in the
`migrations` table and orders pending ones by filename across ALL
registered paths. Moving the 72 published files into domain folders
would be *probably* safe (basenames unchanged), but the risk is
unverifiable on every already-deployed database (path caches,
case sensitivity, operator copies), with zero functional benefit.
**Decision per ARCH-01 §B: historical migrations stay exactly
where they are; their identity and order are untouched.** The
domain-owned paths are registered additionally and are the ONLY
allowed location for NEW migrations. On a fresh database the
migration order is unchanged today (no domain migrations exist
yet) and stays deterministic tomorrow because (a) the registered
path list is an explicit ordered array in `DomainPaths` — never a
recursive scan — and (b) Laravel sorts pending migrations by
filename across paths, so dated filenames keep global order.

Rollback behavior: `migrate:rollback` uses the same recorded
basenames; unchanged for historical files. New domain migrations
must always ship a working `down()` (or be explicitly
forward-only by documented decision, like 000016's data copy).

## 3. How registration works

- `DomainPaths::migrationPaths()` — explicit ordered list
  (legacy `database/migrations` first, then Core domains in
  dependency order, then business modules). `ModuleServiceProvider::boot()`
  calls `loadMigrationsFrom()` with the paths that exist.
- `DomainPaths::routeFiles()` — the Core route files loaded, in
  original registration order, by the thin registrar in
  `routes/api.php` (inside the exact same `v1` prefix + middleware
  groups as before; the public invitation preview keeps its exact
  public position in the file).
- Adding a **new Core domain**: create `app/Core/{Domain}` with
  `Database/Migrations`, `Database/Seeders` (+ optional `Routes`),
  add the key to `DomainPaths::CORE_DOMAINS` (order matters —
  dependencies first), and justify it in the stage report.
- Adding a **new business module**: `app/Modules/{Module}` the
  same way, key added to `DomainPaths::BUSINESS_MODULES`, plus a
  C4 `ModuleCatalog` entry (a module is more than a folder).
- Adding a **route**: put it in the owning domain's
  `Routes/api.php` (authenticated surface) or `Routes/public.php`
  (unauthenticated). NEVER append Core routes to `routes/api.php`
  directly; that file is legacy + registrar only and may not grow
  Core blocks again (architecture test enforces this).
- Adding a **migration**: `php artisan make:migration ... --path=app/Core/{Domain}/Database/Migrations`
  (or the module equivalent). Never edit an applied migration.
- Adding a **seeder/factory**: essential reference-data seeders
  live in the domain's `Database/Seeders`; factories stay in
  `database/factories` (Laravel's autoloaded factory namespace)
  unless a domain grows enough to justify its own, documented here.

## 4. Essential vs demo data (standing rules)

**Essential** (`php artisan tadbir:seed-essential`): idempotent,
rerunnable reference/configuration data only — permission catalog
sync, protected Primary Administrator role DEFINITION (never an
assignment), module registry sync, settings registry sync. It
never creates user accounts, never assigns platform roles, never
activates modules, never grants workspace access. The legacy
`DatabaseSeeder` keeps its existing required-access contract and
is unchanged; production runs only essential data, at explicit
operator direction.

**Demo** (`php artisan tadbir:seed-demo`): local/testing ONLY —
the command fails closed (exit 1) in any other environment, and
demo data is never part of `DatabaseSeeder` or any production
seed path. Everything is recognizably prefixed `DEMO`, uses
`@example.test` addresses and `demo-*` usernames, and is
idempotent (deterministic natural keys; re-runs create nothing
twice). The demo password comes from the `DEMO_USER_PASSWORD`
environment variable or is generated randomly and printed ONCE
to the local console — no fixed known password exists anywhere
in the codebase. Demo subscriptions are assigned only when the
operator names an ALREADY-authorized platform actor via
`DEMO_SUBSCRIPTION_ACTOR` (an existing username holding
`platform.subscriptions.manage` through normal provisioning);
the demo builder never creates platform privileges. Demo plans
are real draft→published versions through `PlanProvisioner`;
demo settings/invitations go through the real C7-2/C6 services
or store primitives with the demo owner as actor.

## 5. Frontend organization

- `src/app/App.tsx` — SPA router/bootstrap component (entry point
  remains `src/main.tsx`, importing `./app/App`).
- `src/features/{feature}` — one folder per product feature; the
  C6 invitations feature moved to `src/features/invitations`
  (`api.ts`, `invitationLogic.ts`, `invitationSession.ts`,
  `components/*`). Features import shared code from
  `src/api` (transport), `src/context`, `src/utils`, `src/config`
  — shared layers never import features (no cycles).
- Business-module UIs will live under
  `src/features/modules/{moduleKey}` when they are built (post-Core
  stages); the public marketing website remains a future separate
  deliverable (not in this stage, per ARCH-01 §H).
- Future moves happen feature-by-feature with import updates and
  the frontend test suite as the regression gate — never a
  big-bang rename.

## 6. New-developer setup (Windows)

```powershell
# Prerequisites: PHP 8.3+, Composer 2, MySQL 8, Node 20+, Git
git clone https://github.com/nmahdin/main-tadbir.git
cd main-tadbir\backend
copy .env.example .env
composer install
php artisan key:generate
# create database tadbir_dev in MySQL, set DB_* in .env
php artisan migrate
php artisan tadbir:seed-essential   # idempotent reference data
php artisan tadbir:seed-demo        # LOCAL ONLY demo scenario (fails elsewhere)
php artisan serve

cd ..\frontend
npm install
npm run dev        # Vite on :3000, proxies API per .env
npm run typecheck; npm test; npm run build
```

## 7. Enforcement

`backend/tests/Unit/Architecture/ModularStructureTest.php` runs in
the normal suite and fails when: a Core domain lacks its
`Database/Migrations`/`Seeders` folders; `DomainPaths` loses its
deterministic ordering; Core route blocks reappear in
`routes/api.php`; the demo command's environment guard or the
essential/demo separation regresses (source-level assertions);
or a domain route file is dropped from the registrar list.
Combined with `DependencyRulesTest` (cross-module imports),
Pint, and the full C1–C7 regression, structure regressions fail
CI before review.
