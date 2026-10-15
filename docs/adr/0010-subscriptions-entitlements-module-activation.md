# ADR-0010 — Subscriptions, Entitlements, and Module Activation Boundaries
**Status:** PROPOSED with lifecycle **OPEN** · Stage 01

## Context (CONFIRMED)
No plans, subscriptions, feature registry, or module activation exist. The draft core §7 described behaviors (post-expiry read/export continuation, price-change timing) as if decided; playbook rule 13 declares subscription status semantics an OPEN DESIGN ITEM that must never be invented during coding.

## Decision (PROPOSED boundaries; statuses deliberately undecided)
1. **Four separate gates, never merged:** (a) subscription entitlement (does the effective plan include the feature?), (b) organization policy (does the org prohibit it?), (c) workspace module activation (is it on in this workspace?), (d) user authorization (ADR-0008). Effective access requires all applicable gates. Entitlement never grants permission; permission never overrides org policy or plan.
2. Registry first: `module_definitions` + plan-feature configuration are data defined by system administrators; **new features default to disabled in all plans** (playbook rule 11). A plan may not reference an unimplemented feature.
3. Coverage: one effective personal subscription per user covering their personal workspaces; one effective organizational subscription covering all of the organization's workspaces. Personal subscriptions are scoped to the person, shared across that person's permitted personal workspaces (playbook rule 2).
4. Payments are a separate concept: `payment_attempts`/payments with historical price snapshots; a failed or recorded payment never by itself activates a subscription. Manual activation and manual renewal only in v1; no payment provider, no auto-renewal.
5. Plan changes (upgrade/downgrade) are immediate **after impact preview + explicit confirmation**, preserving existing records and change history.
6. Over-limit behaviors (binding from playbook rule 12): workspace over-limit → ordinary org workspace operations blocked until admins deactivate enough workspaces, with a **recovery administration route always available**; member over-limit → block additions, preserve existing members; storage over-limit → block uploads, preserve/download existing files.
7. Detailed design belongs to Stage 06; module registration hooks (module ID + feature keys) are already required from Stage 02 so Stage 06 is configuration, not archaeology.

## OPEN — must be ratified before Stage 06 (Q-01)
Subscription status enum and transitions (trial/active/grace/expired/suspended/cancelled?), post-expiry read/export rights per status, org suspension vs subscription expiry interaction, personal extra-workspace billing edges, effective-subscription resolution if multiple records overlap, refund/void semantics. **No stage may hardcode these.**
