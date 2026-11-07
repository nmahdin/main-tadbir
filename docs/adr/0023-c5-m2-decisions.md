# ADR-0023 — C5-M2 Commercial Foundations: Approved Decisions (M2-D1…M2-D5)

**Status: ACCEPTED (product owner, transmitted by the Chief Software
Architect). Specification recorded in
`docs/architecture/spec-c5-m2-commercial-pricing-quotes-order-review.md`.
M2-S1 implementation authorized and delivered on
`arena/582a70e5-main-tadbir`; M2-S2, S3, S4 await completion. No
payment execution exists. C5-M2 Q1/Q2/Q3 ratified as option A by the
product owner on 2026-11-02 (see below); Q4/Q5 remain pending.**

## Implementation defaults

The following defaults were shipped as **provisional** in M2-S1 and
have been ratified by the product owner on 2026-11-02 (Q1/Q2/Q3 = A,
transmitted by the Chief Software Architect). They are now approved
configuration defaults (not open to silent re-litigation):

- `billing.order_review_ttl_days = 7` (configurable, independent of
  the 30-minute configurable quote TTL) — **C5-M2 Q1 = A, approved**.
- Exactly one promotional code per quote; no stacking — **C5-M2 Q2 =
  A, approved**.
- At most one applicable active tax rule at a time — **C5-M2 Q3 = A,
  approved**.
- Initial purchases only; upgrade/proration deferred (still pending
  product-owner decision; see Q4 below).
- Catalog surfaces annual pricing as unavailable (`null` pointer)
  rather than hiding plans without an annual price (still pending
  product-owner decision; see Q5 below).

## Related approved subscription decisions (preserved, not re-decided here)

The following subscription-policy decisions are approved by the
product owner (see ADR-0025 §"Previously approved decisions preserved")
and are normative for all later C5 milestones. They constrain S2/S3/S4
implementation but are NOT re-opened by this ADR:

- Package-based subscriptions; no monetary daily balance, no
  transferable balance, no unused-time credit upon upgrade; no
  prorated refund upon upgrade — **business policy APPROVED**.
- Immediate paid upgrade: new period starts immediately after verified
  payment, with the new period's entitlements taking effect on the
  successful-payment boundary (no silent credit/offset of unused prior
  time) — **APPROVED**.
- Deferred downgrade: downgrade takes effect at the next renewal
  boundary; current paid term is honored at the original tier; above-
  limit data is preserved read-only (C5-SUB-10=A) — **APPROVED**.
- Independent monthly, quarterly, and annual prices; per-plan
  enablement of purchasable periods (a plan may sell monthly only,
  monthly+annual, monthly+quarterly+annual, etc., by the
  administrator's choice); no silent derivation of one period's
  price from another — **APPROVED** (quarterly is approved at the
  policy level but M2-S1 `CorePlanPrice::PERIODS` contains only
  `monthly`/`annual`; adding the `quarterly` constant, period value,
  admin CRUD coverage and quote coverage is a required future change
  tracked in ADR-0025, NOT performed by this ADR).
- Manual renewal; seven-day grace followed by eligible Free conversion
  with data preservation — **APPROVED** (inherited from M1 / ADR-0013
  provisional lifecycle, ratified through ADR-0025).

## Remaining OPEN (implementation details, not business policy)

The no-proration, no-monetary-daily-balance, immediate-paid-upgrade,
deferred-downgrade, independent per-period pricing and per-plan period
enablement policies are **already approved** and are not re-litigated
below. The remaining open items are concrete implementation/surface
details for later milestones:

- **C5-M2 Q4-impl (pending):** *Implementation detail* for the future
  plan-change milestone (S3): exact request/response shape, idempotency
  key, and webhook/callback edge cases for the immediate-paid-upgrade
  path (business policy = immediate upgrade, no credit, is already
  fixed). Specific question: whether any pending quote for a plan
  change is superseded on successful payment, and what audit fields
  the new subscription-period row carries. Must be specified before
  S3 plan-change endpoint work begins; it does NOT reopen the approved
  no-proration policy.
- **C5-M2 Q5 (pending):** Catalog UX question (S5) — whether a plan
  lacking a price for a given period appears as unavailable (null
  pointer, current provisional default) or is hidden in period-
  comparison catalog surfaces. This is a presentation decision; it is
  separate from the approved per-plan period-enablement rule (a plan
  sells exactly the set of periods it has published prices for). Must
  be explicitly approved before S5 catalog surfaces ship.

## Related
- ADR-0022 (AMB-C5-01…08) remains binding; SPEC-C5-M2 §8 traces every
  decision to its specification section.
- ADR-0025 (core capability decisions 2026-11-02) preserves and
  cross-references these subscription policies and records future
  schema/code changes required for quarterly pricing, renewal period
  switching, and deferred downgrade.
- G-2 (organization storage attribution), G-3 (Free 100-year expiry
  semantics) and G-5 (resource snapshot refactor) from the C5 M1
  closure audit remain open findings with their own dependencies; they
  are not decided or implemented here. G-6 (legacy organizations without
  subscriptions) retains the approved non-mass-assignment policy.

## Decisions

### M2-D1 = A — Organization billing authority
A planned scoped permission `organization.billing.manage`: scoped to the
authorized organization, granted to its eligible owner by default,
delegable only through approved role/permission administration, never
inferred from an unrelated organizational role. Not yet added to any
runtime permission catalog.

### M2-D2 = A — Platform pricing authority
A planned platform permission `platform.billing.manage` governs
platform-level pricing and commercial configuration.
`platform.subscriptions.manage` must not be reused as an implicit
substitute. Documentation-only until M2 implementation authorization.

### M2-D3 = A (as amended) — Independent order-review lifecycle
Quote creation, quote conversion, and order-review lifetime are distinct:
quotes are valid 30 minutes by default (administrator-configurable);
conversion is allowed only while the quote is open and `now < expires_at`
(at the exact expiry instant conversion fails); a successfully converted
order keeps an immutable snapshot of the agreed amounts and follows its
own explicit state/lifecycle, independent of the quote countdown; a
created order is never invalidated solely because its source quote later
expires; conversion of a superseded quote is prevented except for
idempotent replay of an already-successful conversion. Order-review
expiry/cancellation and future payment-readiness transitions are defined
in SPEC-C5-M2 §3.4. No unapproved fixed order TTL is decided: the
specification proposes a configurable default
(`billing.order_review_ttl_days`, proposed 7 days) for product-owner
confirmation.

### M2-D4 = A — Scarce promo reservation accounting
Open, valid reservations count toward a promo code's `max_redemptions`
capacity; reservation is atomic against available capacity; expired,
released, or cancelled reservations cease consuming capacity; simultaneous
over-reservation is prevented; idempotent quote retries are preserved;
actual redemption occurs only at the later payment milestone — an unpaid
quote is never marked redeemed.

### M2-D5 = A — Independently published annual prices
Annual prices are independent published values: never derived from
monthly prices, offered only when a valid published annual price exists,
preserved in a valid quote once locked, and no discount is silently
inferred from the monthly↔annual relationship. This policy extends by
analogy to quarterly prices when quarterly is enabled for a plan: a
quarterly price is its own independent published value, not a derived
fraction or multiple of monthly.
