# ADR-0012 — Code Quality and Project Structure as Mandatory Gates
**Status:** ACCEPTED* (mandatory gates, as corrected 2026-10-15: thresholds are review triggers, not hard limits)

## Context (CONFIRMED)
Monolith today: backend God-class hotspots (`GoogleWorkspaceService` 894 lines, `DamAssetController` 863), frontend hotspots (`SettingsView.tsx` and `DamDataTables.tsx` 1723 lines each, `DamLibrary.tsx` 1319). Tooling reality: Pint is a dev-dependency but has **no `pint.json` and is not enforced in CI**; no PHPStan/Psalm; frontend has **no ESLint/Prettier config at all** (`lint` is only `tsc --noEmit`), and `tsconfig.json` is **not strict** (no `strict`, `noUncheckedIndexedAccess`); CI runs typecheck + node tests + build + PHPUnit + a fresh-SQLite migration gate. `backend/vendor/` and `frontend/dist/` are tracked by documented shared-host release policy.

## Decision (PROPOSED)
1. The standards in `docs/CODING_STANDARDS.md` and the target layout in `docs/PROJECT_STRUCTURE.md` are **normative for all code written or moved from Stage 02 onward**; every implementation-stage PR reports compliance in its acceptance checklist.
2. Enforcement is tooling-first, introduced gradually per stage (never a repo-wide cosmetic reorganization): Pint config + CI check, PHP static analysis at a documented level with a baseline for legacy code, TypeScript strictness ratchet, ESLint/Prettier adoption, architecture dependency tests, size/complexity *review thresholds* for touched files (a threshold triggers a cohesion review, never automatic fragmentation of cohesive code).
3. New code goes to the target structure; legacy code moves only when its module is migrated (Stage 05) or when a touched file would otherwise breach the budgets — then the minimal extraction is part of that PR.
4. Deviations require a recorded exception in the stage PR (rule, reason, removal date). Unexplained deviations fail review — quality is a gate, not cleanup-when-free (user instruction).

## Consequences
Stage 02 must land the first enforceable subset (Pint, architecture test skeleton, parity test) rather than the full tooling wishlist; each later stage tightens one ratchet. Objective criteria are defined in `docs/CODING_STANDARDS.md` §7.
