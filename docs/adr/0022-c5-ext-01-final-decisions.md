# ADR-0022 — C5-EXT-01 Final Product Decisions (AMB-C5-01…08)

**Status:** ACCEPTED (user authorization, 2026-10-19). Binding for C5-EXT-01 implementation, beginning with Milestone M1 (Free-plan foundation). These decisions resolve §15 of `docs/architecture/spec-c5-ext-01-plans-subscriptions-checkout-billing.md`.

| # | Decision | Resolution |
|---|---|---|
| AMB-C5-01 | Currency unit | **B — Iranian Toman (تومان) is the canonical internal money unit.** Integer amounts denominated in Toman for all new commercial records; no floating-point money; denomination explicit in field names, value objects, API contracts, labels, and audit records. A documented conversion boundary is mandatory before any payment integration (providers may expect Rial or another unit — never assumed, never silently converted). **Legacy audit (M1):** the schema contains no monetary columns at all (only the free-text `projects.budget` label, which is not a financial record); therefore no legacy values exist to reinterpret or migrate, and the Toman-integer convention applies to all future commercial records from first creation. |
| AMB-C5-02 | Payment provider | **A — provider-neutral adapter; operator configures a licensed PSP via env.** No provider selection/connection/payment code in M1. |
| AMB-C5-03 | Organization Free activation | **B — automatic activation for eligible newly created organizations.** Idempotent, concurrency-safe, provenance-checked; never downgrades/replaces an existing legitimate subscription; missing published plan ⇒ explicit recoverable pending state + controlled resume; legacy organizations are NOT mass-assigned (eligibility/reconciliation policy required first). |
| AMB-C5-04 | Tax presentation | **A — exclusive, itemized tax** (base price + separately itemized tax + transparent total) for future commercial milestones. No tax engine in M1. |
| AMB-C5-05 | PDF engine | **A — dompdf**, subject to Persian shaping/RTL/font verification tests in the receipts milestone; compatible alternative if tests fail. No PDF work in M1. |
| AMB-C5-06 | Late verified payment | **A — valid eligible late payments activate atomically; otherwise auditable refund/controlled financial resolution.** No payment state machine in M1. |
| AMB-C5-07 | Price administration | **A — authorized Platform Management users**, audited endpoints + real Ocean UI (future milestone). No paid pricing UI in M1. |
| AMB-C5-08 | Quote validity | **A — 30 minutes default**, configurable by authorized administrators; valid quotes preserve the agreed price. No quote generation in M1. |

**M1 scope guard:** only decisions AMB-C5-01 (recorded convention; no money code) and AMB-C5-03 (automatic Organization Free) have implementation effect in M1. AMB-C5-02/04/05/06/07/08 bind future milestones M2–M6, which remain **unimplemented and unauthorized**.
