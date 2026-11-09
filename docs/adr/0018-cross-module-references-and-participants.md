# ADR-0018 — Cross-Module References, Aggregation, and Public Participants (Proposal)

**Status:** PROPOSED (product-alignment design stage) — participant identity mechanics flagged for product-owner approval (OD-9).

## Context (CONFIRMED)
Solutions and dashboards must display related Tasks/Content/Finance/Forms/DAM data without duplicating records or joining across module tables (Stage 04B already proved the narrow pattern: same-workspace FK validation on content plans/series, record assertions, firewalled legacy aggregates). Public product surfaces (event registration, survey links, competition entries) need actors who are not workspace members.

## Proposal
1. **References, not copies:** cross-module links are typed pointers (`owner_module`, `record_type`, `record_id`, `workspace_id`), validated same-workspace at write (422 otherwise), resolved only through the target module's `Contracts/` read API with re-authorization at read time; no cross-module SQL joins, no copied display fields as truth (full contract: `docs/architecture/cross-module-contracts.md` §§2–3).
2. **Aggregation is composition:** dashboards (solution, organization, personal) compose per-request from already-authorized contract results, each under its source workspace's context; finance amounts additionally require the Finance module's own permissions; nothing is copied into the personal workspace (§4).
3. **Public participants** are module-owned, engagement-scoped identities with capability tokens (submit/view-own only), distinct from workspace memberships; promotion to member is an explicit module action, never implicit email matching (§5).
4. **Service identities** for integrations are scoped grants checked per action; adapters hold no permission copies (§6).
5. Explicitly rejected: a universal entity framework/EAV store and generic cross-module ORM sharing.

## Consequences
Module migration stages implement these contracts pair-by-pair (Tasks links first, Finance read models when Finance exists). Portal features cannot be built on workspace sessions; they need the participant contract approved first.
