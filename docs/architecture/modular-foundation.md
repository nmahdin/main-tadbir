# Modular Foundation — As Built in Stage 02

- **Status:** Implemented (Stage 02). Baseline: Stage 01 commit `386e9a7`. Target architecture: `docs/architecture/core.md`, ADR-0001/0012, `docs/PROJECT_STRUCTURE.md`.

## What exists now
```text
backend/app/Core/Modules/        ModuleManifest (id + owned permission keys), ModuleRegistry, ModuleServiceProvider
backend/app/Modules/Reference/   ReferenceModule — fixture/example, no routes/tables/behavior, NOT auto-registered
backend/app/Integrations/        Reserved for adapters (Bale, Google) — empty except .gitkeep until Stage 05
backend/tests/Unit/Architecture/ ModuleRegistryTest (6 tests), DependencyRulesTest (4 tests)
backend/pint.json                Laravel preset
frontend/tests/permissionCatalogParity.test.mjs   Backend↔frontend permission-catalog parity (2 tests)
.github/workflows/quality.yml    + scoped Pint step for the new zones
```

## Conventions (binding for Stage 03+)
1. New domain code goes to `app/Core/<Area>` (platform) or `app/Modules/<Module>` (business). Nothing new is added to legacy zones (`app/Services`, `app/Models`, `app/Http/Controllers/Api/V1`, `app/Bot`) for domains that have migrated.
2. A module's public surface is only: its `*Module` manifest provider, a future `Contracts/` namespace, and its registered events. All other classes are internal (enforced by `DependencyRulesTest`).
3. Dependency direction: Modules → Core; Integrations → module Contracts; Core → nothing in Modules/Integrations; no cross-module internal imports; no cycles.
4. Registration is explicit: a module is registered by calling `$registry->register(<Module>::manifest())` in its own wiring when it is introduced (Stage 05). Stage 02 registers **no** business module, so there is exactly one source of truth for permissions today (the existing seeder).
5. Autoloading needs no composer change: the existing `App\ → app/` PSR-4 mapping covers the new namespaces.

## Quality gates added / evaluated
| Tool | Stage 02 outcome |
|---|---|
| Laravel Pint | `pint.json` (laravel preset) + CI `pint --test` scoped to `app/Core app/Modules tests/Unit/Architecture bootstrap/providers.php`. Legacy zones join the scope as they migrate (ratchet, CODING_STANDARDS §6) |
| PHPUnit architecture tests | `tests/Unit/Architecture` — dependency directions, manifest-per-module, registry semantics (duplicates, unknown lookup, invalid ids/keys, sorted key aggregation) |
| Permission parity | Node test asserts backend seeder keys == frontend catalog keys (78/78 at Stage 02), with an explicit, self-checking backend-only allowlist (currently empty) |
| PHPStan/Larastan | **Evaluated, deferred (deviation D-S02-1):** the Stage 02 sandbox has no PHP/Composer binary, so a dependency cannot be installed or lock-verified responsibly, and editing `composer.lock` by hand is prohibited by the same lock contract CI validates. Entry plan: first PR of Stage 03 (or a dedicated tooling PR) runs `composer require --dev phpstan/phpstan` (+ Larastan if chosen), level 5 scoped to `app/Core` + `app/Modules` with a legacy baseline, CI `-step` added in that PR. Architecture tests already enforce the highest-value static rules (boundaries) without the dependency |
| ESLint / Prettier (frontend) | **Evaluated, not adopted in Stage 02:** adopting now would reformat or flag large parts of the other contributor's active UI tree and collide with open frontend PRs. `lint`/`typecheck` (`tsc --noEmit`) remain enforced; ESLint/Prettier adoption is scheduled for the first frontend-touching stage under the ratchet in CODING_STANDARDS §3, agreed with the frontend contributor |
| TypeScript strict | Unchanged (passes). Strict-mode ratchet also belongs to the first frontend-touching stage |

## Commands (developer reference)
```bash
cd backend && php vendor/bin/pint --test app/Core app/Modules tests/Unit/Architecture bootstrap/providers.php
cd backend && php vendor/bin/phpunit --testsuite=Unit --filter Architecture
cd frontend && npm test           # includes permissionCatalogParity
cd frontend && npm run typecheck
```

## Non-goals honored
No routes, controllers, models, services, schemas, migrations, seeders, roles, authorization behavior, or frontend components were changed. Existing code was not relocated.
