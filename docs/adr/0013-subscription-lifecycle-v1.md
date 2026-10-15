# ADR-0013 — Subscription Lifecycle v1 (Proposal resolving Q-01)

**Status:** PROPOSED (design-freeze stage, baseline `7b90a73`) — requires explicit human approval of the flagged business-policy choices before any Stage 06/C5 implementation. Extends ADR-0010 (boundaries already ACCEPTED*); does not contradict it.

## Context (CONFIRMED)
ADR-0010 fixed the four-gate separation, manual activation, payments ≠ subscription, and over-limit principles, but deliberately left status semantics OPEN (Q-01), blocking entitlement implementation. Stage 04B had to ship Projects gates through a temporary pilot policy precisely because no lifecycle exists.

## Proposal
1. **Statuses:** `pending → active → past_due → suspended → expired`, plus `cancelled` (takes effect at period end). Manual renewal only in v1 (`auto_renew=false`); renewal from `past_due/suspended/expired` restores `active` with a new period, recorded in `subscription_events`. No trial status in v1 (a platform-defined free plan covers evaluation needs).
2. **Behavior per status:** read/export never revoked for the data owner; writes freeze at `suspended`; management planes stay reachable for billing/platform roles. Full matrix: `docs/architecture/authorization-entitlement-decision.md` §5.
3. **Coverage:** one effective subscription per user (personal workspaces only) or per organization (all its workspaces), resolved by subscriber discriminator + non-terminal status; overlaps impossible by unique discriminator on effective rows.
4. **Plan versions are immutable once published**; subscriptions pin a version; price/limits change only via explicit upgrade/downgrade with preview + confirmation (downgrade effective at period end). New features are absent (disabled) in all existing versions.
5. **Payments:** `payment_attempts` recorded separately; only the subscription service transitions state. v1 activation is manual (platform admin); no provider integration.

## Business-policy choices requiring explicit approval (OD-2)
Grace length (proposed 7 days), suspended→expired horizon (proposed 30 days), existence of a free plan (proposed: yes, platform-defined), downgrade effective timing (proposed: period end), refund/void semantics (proposed: out of v1 scope; manual admin adjustment via events).

## Consequences
On approval, Q-01 closes and roadmap stage C5 may implement the evaluator + gates and retire the Projects pilot policy. Until approval, gates remain fail-closed / pilot-only (non-production).
