# ADR-0002 — Organization, Personal Workspace, and Organizational Workspace Ownership
**Status:** ACCEPTED* (target direction, 2026-10-15; subject to OPEN questions) · Stage 01

## Context (CONFIRMED)
No `organizations`/`workspaces` concepts exist. The whole installation behaves as one implicit tenant; code comments call it "organization-wide" (e.g. `AnalyticsController`, DAM quota). Playbook rules 2–4 mandate the target semantics.

## Decision (PROPOSED)
1. `workspaces.owner_user_id` nullable FK → users; `workspaces.organization_id` nullable FK → organizations. **Exactly one is non-null (XOR)** — enforced by domain validation on every write and by DB constraint per ADR-0009. `kind` (`personal`/`organizational`) is derived from which owner is set, never stored as an independently editable flag.
2. Every user receives exactly one **default personal workspace** (unique per owner); additional personal workspaces are an entitlement question (plan-gated, Stage 06), not a schema question.
3. Creating an organization, its initial admin organization-membership, and its one **default organization workspace** is a single database transaction; duplicate creation under concurrency must be impossible (idempotency/unique constraints, tested in Stage 03).
4. A workspace is the strict operational data boundary: every operational record belongs to exactly one workspace, except records explicitly modeled as platform-level or organization-level reference data (each exception is named in its module's Stage 05 PR).
5. No silent workspace selection for ambiguous data (playbook safeguard), and no moving records between workspaces except through an explicit, audited operation (out of v1 scope).

## Consequences
All operational tables gain `workspace_id` during their module's Stage 05 PR (fresh schema in disposable dev DBs; no legacy backfill under the revised strategy). Frontend needs a workspace-context contract (Stage 03, functional coordination only).

## OPEN
None for ownership shape. Plan limits on extra personal workspaces → ADR-0010/Q-01.
