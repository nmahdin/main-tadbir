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

## Remaining OPEN (post-Q1/Q2/Q3 ratification)

- **C5-M2 Q4 (pending):** Upgrade credit / proration from an existing
  paid subscription; must be explicitly approved by the product owner
  before S3 plan-change quotes ship.
- **C5-M2 Q5 (pending):** Whether a plan lacking a price for a given
  period appears as unavailable (null pointer, current provisional
  default) or is hidden in period-comparison catalog surfaces; must be
  explicitly approved before S5 catalog surfaces ship.
- Quarterly pricing is approved at the product-policy level (independent
  period price, independently enabled period) but M2-S1 `CorePlanPrice::
  PERIODS` contains only `monthly`/`annual`; adding `quarterly` is a
  required future change tracked in ADR-0025 §"C5-M2 compatibility
  notes", NOT performed by this ADR.

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
inferred from the monthly↔annual relationship.

## Related
- ADR-0022 (AMB-C5-01…08) remains binding; SPEC-C5-M2 §8 traces every
  decision to its specification section.
- G-2 (organization storage attribution), G-3 (Free 100-year expiry
  semantics) and G-5 (resource snapshot refactor) from the C5 M1 closure
  audit remain open findings with their own dependencies; they are not
  decided or implemented here. G-6 (legacy organizations without
  subscriptions) retains the approved non-mass-assignment policy.
