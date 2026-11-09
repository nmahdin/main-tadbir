# ARCH-01 — Modular Repository Organization & Development Demo Data — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `2f4b617` (C7-2). Implementation head: `53cc594`
(CI SUCCESS on push run `39113948841` + PR run `39113952760`;
this report commit follows). Date: 2026-10-18.

Code Complete: YES / Security Verified (within tested boundaries):
YES / Dev-CI Ready: YES / Production Operationally Ready: NO
(unchanged from C7-2; production untouched, no deployment).

## 1. Audit & layout (deliverables 1–2)

Full before/after inventory, target-layout map, and the migration
compatibility assessment live in
`docs/architecture/repository-organization.md`. Key decisions:

- **Historical migrations do not move.** Laravel keys applied
  migrations by basename; relocating the 72 published files has
  unverifiable risk on deployed databases and zero benefit.
  Domain-owned paths are registered additionally and are the only
  allowed location for NEW migrations. Fresh-install order,
  upgrade behavior, and rollback are unchanged (proven by the
  MySQL migration gate + full suite).
- `DomainPaths` (`app/Core/Architecture`) holds explicit,
  ordered, non-scanned registries: Core domains in dependency
  order (Identity … Invitations), business modules (Projects,
  Reference), migration paths, and route files.
  `ModuleServiceProvider::boot()` registers migration paths via
  `loadMigrationsFrom()`. Every Core domain and business module
  now owns `Database/Migrations` + `Database/Seeders` folders.

## 2. Modular routes (deliverable 3)

The Core blocks were extracted VERBATIM from the 447-line
`routes/api.php` into domain-owned files —
`Organizations`, `Rbac`, `Modules`, `Invitations` (api + public),
`Identity`, `Platform` under `app/Core/{Domain}/Routes/` — and
`routes/api.php` is now a thin registrar requiring them at their
ORIGINAL positions (public preview still public; platform group
still after the legacy user routes), inside the same `v1` prefix
and middleware groups. Evidence: before/after extraction of every
`Route::` method/URI and `->name()` produced byte-identical
sorted lists locally, and `ModularStructureTest` asserts the live
route contract (names, methods, URIs incl. platform subscription
routes) plus that Core blocks can never re-enter the registrar.

## 3. Essential vs demo seeding (deliverable 4)

- `php artisan tadbir:seed-essential` — idempotent reference data
  only (permission catalog, protected Primary role DEFINITION,
  module + settings registry mirrors). No accounts, no
  assignments, no activation, no grants. Rerunnable anywhere.
- `php artisan tadbir:seed-demo` — fails closed (exit 1) outside
  local/testing and is never part of `DatabaseSeeder`. Builds a
  deterministic DEMO scenario through the real provisioners/
  services (organization + memberships via C3 provisioners,
  personal workspace, published DEMO plan via `PlanProvisioner`,
  public settings via the C7 store, one pending invitation via
  the C6 service), recognizably `DEMO`-marked with
  `@example.test`/`demo-*` identities, idempotent on re-run
  (count-stable, asserted). Passwords come from
  `DEMO_USER_PASSWORD` or are generated and printed once —
  no fixed known password exists. Subscriptions are assigned
  only when `DEMO_SUBSCRIPTION_ACTOR` names an existing,
  already-authorized platform actor; the command never creates
  platform privileges.
- The legacy `DatabaseSeeder` contract is unchanged
  (InitialSeedTest still green).

## 4. Frontend structure (deliverable 5)

- `src/App.tsx` → `src/app/App.tsx` (entry `src/main.tsx`
  unchanged); the C6 invitations feature moved wholesale to
  `src/features/invitations/` (`api.ts`, `invitationLogic.ts`,
  `invitationSession.ts`, `components/*`) with all imports
  updated; the six text-reading regression tests were repointed.
  No behavior or design change. Local verification: `tsc`
  PASS, 150/150 node tests PASS, `vite build` PASS — plus the
  frontend CI job. Standing rules (features vs shared layers,
  `features/modules/{moduleKey}` for future module UIs, marketing
  site explicitly deferred) are documented in the layout doc.

## 5. Enforcement & verification (deliverables 6–7)

- `tests/Unit/Architecture/ModularStructureTest.php`: domain
  folders exist, migration-path registration is deterministic
  and history-first, Core routes exist only in domain files,
  demo guard + production-seeder isolation, frontend layout.
  Runs in the normal CI suite alongside `DependencyRulesTest`.
- CI evidence: full SUCCESS at `53cc594` — Pint (Stage-02 zones),
  PHPUnit (complete suite incl. C1–C7-2 regression, new
  `DemoSeedingTest`, route-contract assertions), MySQL migration
  gate + concurrency list (fresh `migrate:fresh` proves the new
  path registration), frontend typecheck/tests/build.
- During bring-up, TEMP annotation diagnostics (removed
  afterwards; workflow diff vs the C7-2 baseline is now ZERO)
  surfaced and fixed: Pint indentation/import-order in the
  extracted route files, an FQCN in the route test, demo-command
  reference-data ordering (module registry before plan
  entitlements), and two test-authoring mistakes of mine
  (PendingCommand handling, `api/` URI prefix).

## 6. Boundaries

No C7-3/C7-4 work, no marketing site, no behavior changes, no
historical migration moves, no PR merge, no production changes.
New-developer Windows setup is documented in the layout doc §6.
PR #14 remains OPEN and UNMERGED.
