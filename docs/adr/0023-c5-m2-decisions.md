# ADR-0023 — C5-M2 Commercial Foundations: Approved Decisions (M2-D1…M2-D5)

**Status: ACCEPTED (product owner, transmitted by the Chief Software
Architect). Specification recorded in
`docs/architecture/spec-c5-m2-commercial-pricing-quotes-order-review.md`.
IMPLEMENTATION NOT AUTHORIZED — every item below is documentation/spec
until a separate M2 implementation directive.**

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
