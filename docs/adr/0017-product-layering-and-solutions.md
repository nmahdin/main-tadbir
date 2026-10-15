# ADR-0017 — Product Layering: Core, Reusable Modules, Solutions, Templates (Proposal)

**Status:** PROPOSED (product-alignment design stage, baseline `7b90a73`) — requires product-owner approval (OD-8).

## Context (CONFIRMED)
The product direction defines three families (Personal OS, Organization OS, Specialized Solutions) sharing business modules (e.g. Events uses Tasks/Calendar/Forms/Finance/CRM/Content/DAM/Workflows; Competitions and Surveys share a forms engine). The codebase today has one migrated module (Projects pilot) and legacy monolith zones; without a layering rule, solutions would fork shared modules or embed product logic in Core.

## Proposal
1. Four layers: **Core** (product-agnostic platform capabilities) → **reusable business modules** (single-sourced records, `Contracts/` surfaces) → **specialized solution modules** (domain logic over reusable contracts) → **solution templates/compositions** (data-only configuration, own no records). Dependencies point downward only; Core imports no business module (ADR-0001 enforced by architecture tests).
2. The canonical inventory is `docs/architecture/product-and-module-catalog.md`; module/solution IDs declared there are the manifest/entitlement identifiers. Future areas are ID reservations only.
3. Multiple solutions coexist in one workspace via activation + composition; separate security/membership/billing/retention boundaries require separate workspaces (cross-workspace sharing is not v1).
4. The personal dashboard is a per-request composition across the user's workspaces under each workspace's own authorization context — never a data copy into the personal workspace.

## Consequences
Core completion stages (C1–C10) stay product-agnostic; solution work is scheduled after Core, one module/solution per approved stage. Dashboard composition and references follow `cross-module-contracts.md`.
