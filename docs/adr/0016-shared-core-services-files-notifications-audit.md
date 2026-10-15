# ADR-0016 — Shared Core Services: Files, Notifications, Audit (Proposal)

**Status:** PROPOSED (design-freeze stage).

## Context (CONFIRMED)
DAM owns all file storage/access today; notifications live in legacy inbox/Bale classes; only a user-facing `activity_logs` feed exists (no security audit, D-18 accepted but unimplemented); signed-link semantics were OPEN (Q-09).

## Proposal
1. **Files Core** (`Core\Files`, spec §G): owns storage mechanics, metadata, quotas, and per-download authorization mediated through the linked record's workspace + module permission. DAM keeps asset semantics as a consumer module. Signed links: 15-minute TTL, epoch-based revocation (workspace suspension/deletion bumps `file_epoch`, invalidating outstanding links) — resolves Q-09 as proposal (OD-4 confirms TTL/retention numbers).
2. **Notifications Core** (spec §H): Core owns inbox rows + preferences + delivery attempts with tick-based retry (ADR-0011); modules produce via contracts/events; deep links always re-authorize at follow time.
3. **Audit** (spec §I): append-only `audit_logs`, written in the same transaction as management-plane mutations; strictly separate from the user-facing activity feed and from application logs. Sensitive values masked by a key registry.
4. **Events/outbox** (spec §J): after-commit synchronous events by default; transactional outbox only for failure-critical cross-module reactions, drained by idempotent triggered ticks (shared-hosting constraint).

## Consequences
Gives Stages C8/C9 (roadmap) their contracts. No legacy DAM/notification behavior changes until their module migration stages consume these services.
