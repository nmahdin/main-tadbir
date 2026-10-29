# ADR-0015 — Invitations and Membership Acquisition (Proposal resolving Q-08)

**Status:** PROPOSED (design-freeze stage) — verification mechanics require human approval (OD-3).

## Context (CONFIRMED)
Memberships exist with a full lifecycle (03A/03B) but members can only be added directly for existing users; no invitation, expiry, or self-service acquisition path exists (Q-08 OPEN).

## Proposal
1. `invitations` table (design: `docs/architecture/core-data-model.md` §2): one scope (organization XOR workspace — modeled as scope_type+scope_id), one invitee identifier (email, phone, or username, normalized), one scope-matching role checked against the inviter's grant ceiling, hashed single-use token, `pending/accepted/expired/cancelled`, default 7-day expiry.
2. Acceptance is authenticated and idempotent: the invitee proves control of the invited identifier (signed email link / phone OTP / signed-in username match — final channel mechanics are OD-3), then membership is created (or rejoined as a new row) with the invited role, subject to member quota. Accepting a workspace invitation to an **organizational** workspace auto-creates the organization membership (default Member role) if absent — the only implicit acquisition path.
3. Organization managers may add **themselves** to one of their organization's workspaces only via an explicit, audited role assignment (no silent access). No open self-join links in v1.
4. Invitation create/cancel requires `*.members.manage` in the target scope; all transitions audit-logged; token secrets never logged or stored raw; expired invitations cannot be accepted (reissue = new invitation).

## Consequences
Q-08 closes on approval (with OD-3). Enables roadmap stage C6 (after the C5 quota evaluator). Legacy direct-add remains for existing users.

## Correction-pass hardening (binding detail for this proposal)
1. **No unauthorized organization-management privilege, ever:** the implicit organization membership created by a workspace-invitation acceptance carries exactly the protected Organization Member role (`organization.view`). It cannot be parameterized, upgraded by the inviter, or combined with the invited workspace role. Organization management keys remain obtainable only from an Organization Manager inside the organization scope.
2. **Organization onboarding policy** (org-manager controlled, default `require_org_admin_approval`): `allow` / `require_org_admin_approval` / `deny` — governing whether workspace invitations may create org memberships at all. Under approval mode no membership activates before org-manager approval; under `deny` an org membership must pre-exist.
3. **Ceilings in both scopes:** invited workspace role keys are snapshotted at invite time and must be a subset of the inviter's grantable keys then; acceptance re-validates role existence and status. Inviter authority is re-checked at creation; invitation creation requires `*.members.manage` in the target scope.
4. **Concurrency:** acceptance is a single transaction under the Stage 03B scope-container lock: single-use status transition, expiry re-check, and member-quota evaluation inside the lock (serialized last-seat semantics); concurrent accepts are idempotent with exactly one resulting membership.
5. **Mandatory negative tests** are enumerated in `core-v1-specification.md` §C and are C6 acceptance criteria (ceiling escalation, replay, expiry, policy-deny, approval-gating, quota race, suspended/archived targets).

## State, persistence, and authority-loss (correction pass — normative summary)
- Statuses: `pending → accepted | accepted_pending_org_approval | expired | cancelled`; `accepted_pending_org_approval → accepted (activated) | rejected | cancelled`. **No membership rows exist before activation**; approval activates org + workspace memberships atomically (protected Org Member role + invited workspace role), with quota re-checked in-lock (organization row, then workspace row).
- Persistence (data model §2): `invited_permission_keys` snapshot, `org_approval_status/decided_by/decided_at/reason`, `activation_at`, resulting membership ids, `cancel_reason`. Approvals/rejections are performed only by `organization.members.manage` holders and are audit-logged with actor and reason.
- Onboarding policy persists in `organization_onboarding_policies` (C6-owned, org-manager administered, audited) — not in the later C7 settings service.
- **Inviter authority loss:** acceptance re-verifies the inviter still holds `*.members.manage` and that live role keys ⊆ snapshot; on failure the acceptance denies and the invitation is system-cancelled (`cancel_reason=inviter_authority_lost`, audited) for re-invitation by a current manager.
