# ADR-0001 — Modular Monolith Boundaries and Module Ownership
**Status:** PROPOSED (modular monolith itself ACCEPTED by playbook rule 16) · Stage 01 · Baseline `b30bfef`

## Context (CONFIRMED)
Single Laravel app, flat `App\` namespace: 35 models, ~40 services, controllers up to 863 lines (`DamAssetController`), services up to 894 lines (`GoogleWorkspaceService`). Services freely read/write across informal boundaries (e.g. workspace-record conversions create projects/tasks; content sync creates tasks). A complete parallel access surface exists in `app/Bot/Bale/**`. Frontend is a separate React SPA maintained by another contributor.

## Decision (PROPOSED)
1. One Laravel deployment; code organized by module under `app/Modules/<Module>/` and `app/Core/` (Platform Core) introduced in Stage 02; legacy classes move only when their module is migrated (Stage 05), never in a cosmetic big-bang move.
2. Each module owns its models/tables and registers: permission keys, module ID, routes, event names (Stage 02 registration contract).
3. Cross-module interaction: synchronous in-process contract interfaces for immediate answers; domain events for reactions. **Direct writes into another module's tables are prohibited**; reads across modules go through the owning module's contract/query interface.
4. Core owns only shared platform concerns (identity, organizations/workspaces/memberships, RBAC, scoped settings, entitlements, audit, notification inbox, file-access contract, background plumbing). Business rules never accumulate in Core or in generic `App\Services`.
5. Integrations (Bale, Google) are adapter modules: they call contracts, they do not own business data or parallel authorization.
6. Dependency rule: Modules → Core contracts; Core → no business module; adapter → module contracts; never module ↔ module internals, never circular. Enforced by architecture tests from Stage 02 (tool choice in `docs/CODING_STANDARDS.md` §6).

## Consequences
Positive: bounded PRs, testable boundaries, isolation enforceable per module. Cost: temporary coexistence of `app/Modules/*` and legacy `app/*` until Stage 08 cleanup (documented, with removal criteria — not a compatibility adapter for data).

## Alternatives rejected
Microservices (hosting cannot operate them; playbook excludes); big-bang relocation (unreviewable, breaks working features without architectural gain); keeping flat Services (status quo God-class growth).
