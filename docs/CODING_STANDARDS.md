# TADBIR Comprehensive — Coding Standards (Normative from Stage 02)

- **Status:** PROPOSED in Stage 01 (documentation only — no tooling is installed, no code is reformatted by this PR). Becomes binding on explicit approval of the Stage 01 PR; enforced per ADR-0012 as a **mandatory gate** for every later stage.
- Applies to all code written/moved from Stage 02 onward. Existing untouched legacy code is governed by the ratchet rules (§6), not retroactively reformatted.

## 1. Universal rules
1. **Naming says what it is.** No ambiguous names (`data`, `record`, `workspace` without qualifier — ADR-0005), no abbreviations outside the project glossary (`DAM` is allowed and defined; `WS` is not). Boolean names read as predicates (`isDefault`, `hasAccess`).
2. **One concept, one name everywhere:** permission keys (`content.publish`), module IDs, event names, and status enums are registered contracts shared by backend/frontend/tests — never re-typed as string literals in multiple places.
3. **No God classes, no dumping grounds.** `Controller`, `Service`, `Manager`, `Helper`, `Utils` suffixes do not license unbounded growth (budgets §7). Generic `app/Services` / `src/utils` may only hold genuinely cross-cutting code; domain logic belongs to its module (ADR-0001).
4. **No duplicated business rules.** A rule (authorization, status transition, pricing/limit, formatting of a domain value) exists once, in its owning module, and is called through its contract.
5. **No circular dependencies** between modules/contexts; dependency direction per `PROJECT_STRUCTURE.md`. A cycle is a build failure, not a refactor ticket.
6. **Fail closed & explicitly:** authorization denies by default; unknown permission keys/statuses throw or 422 — never silently ignored; no silent fallbacks that widen access.

## 2. Laravel backend
- **Style:** PSR-12 via **Laravel Pint** (`pint.json` committed in Stage 02, preset `laravel`); CI runs `pint --test`. No hand-formatting debates in reviews.
- **Controllers are thin:** authorize (via Core decision), validate (FormRequest), delegate to a module service/contract, return a Resource. No queries, transactions, or business branching in controllers beyond trivial orchestration. One public method ≈ one use case.
- **Business rules centralized** in module domain services/actions; models hold relations, scopes, casts, and invariants — not cross-module orchestration. Cross-module data changes only through contracts/events (ADR-0001/0008).
- **Authorization consistent:** every operational endpoint passes the central decision (core.md §2.1). Route `permission:` declarations are documentation of intent, never the only check (record-level checks always apply). FormRequests never `authorize()`-by-`return true` for operational writes without a recorded reason.
- **Validation & errors:** FormRequests or dedicated validators in the module; errors via the existing JSON exception shape (`bootstrap/app.php` never leaks SQL/debug to API clients — preserve this).
- **Eloquent:** query scopes for workspace scoping (`scopeForWorkspace` style), `strict` mass-assignment (explicit `$fillable`/`#[Fillable]`, no `guarded = []` in Core/modules), enums as PHP backed enums, casts declared. N+1 is a defect: list endpoints eager-load deliberately and are covered by query-count-sensitive tests where the repo already does so (Phase 3 performance tests are the precedent).
- **Transactions** wrap multi-record invariants (organization+membership+workspace creation, last-manager guards, role assignment); idempotency keys for retried commands follow the existing `series_batch_requests`/Bale precedents.
- **Static analysis:** PHPStan (preferred; Larastan if Laravel-specific rules are wanted) introduced in Stage 02 at level 5 for `app/Core` + `app/Modules` with a committed baseline for legacy `app/*`, ratcheting one level per stage toward 8. Tool/level deviation must be decided in Stage 02 with repository evidence — but *some* enforced analysis is not optional (ADR-0012).
- **Tests:** PHPUnit Feature tests per endpoint/invariant, Unit for pure logic; isolation/adversarial tests per ADR-0008; factories per model (today only `UserFactory` exists — every new Core/module model ships its factory). Tests must run on SQLite fast suite; MySQL behavior tests where ADR-0009 requires.

## 3. React / TypeScript frontend
- **TypeScript strictness ratchet:** Stage 02 (or first frontend-touching stage) enables `strict: true` for new feature folders via project references or per-folder config, with a dated plan to strict the whole `src/`; `noUncheckedIndexedAccess` and `noImplicitOverride` are the next ratchets. `any` is prohibited in new code (use `unknown` + narrowing); `@ts-ignore` requires a linked reason comment.
- **ESLint + Prettier adopted** (flat config, typescript-eslint + react-hooks rules) with `lint` running ESLint **and** `tsc` (today `lint` is only typecheck). Formatting is Prettier's job alone; no competing style rules. Adoption happens on the first frontend-touching stage with `--max-warnings` ratcheted to 0 for touched folders — no repo-wide reformat PR.
- **State & data:** server state only through the query layer (`src/queries`, TanStack Query); no component fetches ad-hoc. API DTOs are typed in the feature's `api/` slice, generated from or parity-tested against backend contracts; permission keys imported from the single catalog (parity test, ADR-0004).
- **Design System boundary:** shared primitives live in design-system/common areas owned by the frontend contributor; feature code consumes them. Backend stages never restyle; functional changes keep existing primitives/classes unless the contributor coordinates.
- **Files/components:** one component per file (small helpers colocated); presentational vs container separation inside features; hooks prefixed `use*`; events `on*`; no component may contain API-shape knowledge beyond its feature DTOs.

## 4. Naming conventions (extract)
| Thing | Convention | Example |
|---|---|---|
| Module | PascalCase singular domain noun | `Content`, `Workspaces` under `app/Modules/*` |
| Permission key | `module.verb[_noun]`, dotted lower-case | `content.publish`, `workspace.members.manage` |
| Domain event | `Module.PastTense` | `ContentPublished` (existing precedent) |
| Job/command | verb phrase; artisan `module:verb-noun` | `contents:allocate-codes` (existing) |
| Table / column | snake_case plural tables; `*_id` FKs; no `workspace` ambiguity (ADR-0005) | `workspace_memberships.role_id` |
| API route | `/api/v1/<plural-resource>` + named routes `api.v1.<module>.<action>` | existing convention retained |
| Frontend feature | kebab-case folder, PascalCase components, camelCase hooks/utils | `features/content-review/` |

## 5. Public contracts of a module (must be documented in the module's README/registration)
Module ID, owned tables, permission keys, events published/consumed, contract interfaces other modules may call, settings owned, seed/demo data. Anything not listed is internal and may not be imported by other modules (enforced §6).

## 6. Architecture & quality enforcement (gradual, tooling-first)
1. Stage 02 lands: `pint.json` + CI `pint --test`; PHPStan with legacy baseline; an **architecture test** (PHPUnit) asserting module dependency rules + module-registration integrity; permission-catalog parity test; frontend ESLint/Prettier config (if that stage touches frontend, else first frontend stage). No new runtime dependencies beyond dev tooling without ADR-level justification referencing repository constraints (tracked `vendor/` makes every dependency a release-artifact cost — CONFIRMED Stage 00 fact).
2. Ratchet rule: a PR may not increase Pint/PHPStan/ESLint/strict violations in files it touches; touched legacy files are brought to standard **only in the lines/areas changed** (no unrelated formatting diffs — playbook safeguard).
3. CI is the source of truth: all gates in `.github/workflows/quality.yml` (extended per above) must be green or explicitly waived in the PR with reason.

## 7. Objective acceptance criteria (checked in every implementation stage, from Stage 02)
- [ ] New/moved files: Pint clean; PHPStan no new errors (level per current ratchet); frontend touched files ESLint 0 warnings, `tsc` clean, no new `any`.
- [ ] No new file exceeds **400 lines** without a recorded exception; no new class exceeds **15 public methods** without exception; pre-existing over-budget files (863–1723 lines, Stage 00) may only shrink or stay — growth requires exception.
- [ ] Controllers contain no direct cross-module model writes; architecture test passes (no cycles, no unregistered imports).
- [ ] Every new operational endpoint has Feature tests incl. denial cases; every new model has a factory; module registered with contract docs (§5).
- [ ] No authorization/status/limit rule duplicated in a second place (reviewer attestation + grep evidence in PR).
- [ ] Existing suites: backend PHPUnit, frontend `npm test` + typecheck + build — PASS or explicitly NOT RUN with reason (never silently claimed).
- [ ] PR diff contains no unrelated formatting/reorganization (file list reviewed against stage scope).

## 8. What this document does not do
It does not reformat, move, or delete any existing code; does not install Pint/PHPStan/ESLint/Prettier; does not change `tsconfig.json`. Each tool lands in its stage as a small reviewed PR (Stage 02 first).
