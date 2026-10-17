# ADR-0014 — Platform Administration Scope (Proposal resolving Q-10)

**Status:** PROPOSED (design-freeze stage) — requires human approval (OD-1).

## Context (CONFIRMED)
The authorization resolver gives platform actors no implicit workspace context, and Stage 03B deliberately registered no platform-scope permission keys (Q-10 OPEN). A production SaaS still needs a bounded platform-administration plane (organization oversight, plan management, abuse suspension) without breaking workspace isolation.

## Proposal
1. A third catalog scope `platform` with a minimal key set: `platform.organizations.view`, `platform.organizations.suspend`, `platform.users.view`, `platform.users.suspend`, `platform.plans.manage`, `platform.modules.manage`, `platform.settings.manage`, `platform.audit.view`.
2. Assignment via `platform_role_assignments` (user + role key, granted/revoked by existing platform admins only, fully audited). This is **not** a membership and creates no organization/workspace relationship.
3. Platform powers are management-plane only: they can suspend/reactivate accounts/organizations, manage plans/modules/settings, and read audit data. They **cannot** read workspace operational data, cannot satisfy membership steps, and cannot impersonate members in v1 (any future support-access feature needs its own ADR + explicit member consent + audit).
4. Every platform action writes an `audit_logs` entry; suspension actions require a reason recorded in the audit summary.

## Consequences
Q-10 closes on approval. The decision flow (`authorization-entitlement-decision.md`) is unchanged for operational access; platform checks run on separate management endpoints.
