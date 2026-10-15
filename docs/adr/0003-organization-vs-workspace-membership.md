# ADR-0003 — Organization Membership vs Workspace Membership
**Status:** ACCEPTED* (target direction, 2026-10-15; subject to OPEN questions) · Stage 01

## Context (CONFIRMED)
Today there is no membership concept at all: a global role + department memberships govern everything. Playbook rules 5–7, 14 mandate independent memberships.

## Decision (PROPOSED)
1. Two independent relations: `organization_memberships` (user × organization) and `workspace_memberships` (user × workspace). Neither implies the other.
2. Access to an organizational workspace's data requires **both** active memberships; access to a personal workspace requires ownership or active workspace membership.
3. Organization administrators receive **no implicit workspace data access**; they may assign workspace managers and, where explicitly permitted, join a workspace with an authorized role.
4. Deactivation vs termination are distinct states; exact status enums are **OPEN (Q-05)** and must be ratified before Stage 03 implementation. Non-negotiables either way: deactivating organization membership immediately blocks all of that org's workspaces; historical activity/files remain with the workspace; rejoining an organization does **not** silently restore prior workspace roles (draft core §2, retained); departed members' assigned tasks retain history.
5. Invitations may target unregistered persons; accepting may create organization membership first, then workspace membership. Token security/expiry/idempotency are Stage 05-of-playbook concerns (our Stage 03/04 implementation slices) — design OPEN (Q-08), no behavior invented here.
6. Safety invariant: at least one eligible Workspace Manager per workspace and one eligible organization admin per organization, enforced transactionally on every removal/demotion path (lesson carried from the legacy last-admin guard, which exists today in partial form — CONFIRMED in `AccessAdministration`/user-role flows).

## Consequences
Membership becomes the single source through which roles attach (ADR-0004). The frontend "add member" flows become functional API changes (coordinate, don't redesign).
