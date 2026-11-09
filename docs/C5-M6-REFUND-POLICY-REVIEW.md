# C5-M6 Refund & Adjustment Policy Review

This document captures the explicit refund/adjustment policy state at the M6 delivery boundary. Per directive, M6 ships **read-only foundations only**: reconciliation detects anomalies; no endpoint creates refunds, credits, or adjustments.

## Policies approved for implementation now
1. **No unused-time proration on immediate paid upgrade.** When an owner upgrades to a higher plan mid-period, the remaining time on the old plan is NOT prorated back and NOT credited as cash-equivalent. The new plan period starts immediately; the next renewal is charged at the new plan's rate. This is implemented at the plan-change preview/execute layer in M4 and unchanged in M6.

## Policies NOT yet approved (scope deliberately deferred)
The following have no authorized business/legal decision yet. Code MUST NOT assume a behavior and MUST NOT auto-execute any of these paths:

1. **Voluntary cancellation refunds.** When an org/admin cancels a subscription mid-cycle, does the owner receive (a) no refund, (b) pro-rated time credit usable on next charge, (c) pro-rated cash refund to original payment method, (d) discretionary platform-only credit? Deferred.
2. **Service-outage credits.** If platform uptime drops below a contractual SLO, what credit (amount, currency, who approves, applied how)? Deferred.
3. **Failed/duplicate-charge refunds.** If the PSP settles an amount greater than the order total (caught by `payment_amount_mismatch`), the recovery path (void vs partial refund vs platform credit vs hold) is deferred.
4. **Promo mis-redemption reversals.** If a promo was redeemed on an order that later failed/cancelled, the system currently flags it (`promo_redeemed_but_order_not_paid`) but does not automatically return promo inventory because the policy (single-use code recovery vs permanent redemption) is deferred.
5. **Cross-currency or test-mode accidental charges.** Deferred; PSP configuration will exclude these in production but operations must have a tool; no policy yet.
6. **Chargeback / PSP dispute handling.** Must be handled through the PSP dashboard first, then reconciled; no automated reversal in code.

## Foundation contracts required for any future refund implementation
All future refund work MUST meet these invariants (they are NOT optional):

- **Scoped authorization:** owner + `organization.billing.manage` for org self-service refunds (if any), or platform role for operator-initiated refunds; cross-tenant MUST return 404.
- **Settlement link:** every refund MUST reference an existing settled payment (`provider_transaction_id` non-null and status `PAID`/`FULFILLED`). Zero-payable (`internal`) receipts are non-refundable (nothing was charged).
- **Amount-bounded:** refund amount ≤ captured amount for the payment; multiple partial refunds sum ≤ captured; currency MUST match.
- **Idempotent:** keyed by (payment_id, idempotency_key); replays return the existing refund record.
- **Auditable:** append-only `refund_requested` / `refund_confirmed` / `refund_failed` event stream linked to a Refund financial document; AuditWriter entry for every state transition; refund doc rendered and downloadable like invoice/receipt.
- **Provider-confirmed:** only mark refund fulfilled after PSP confirmation (webhook), not on client return.
- **Concurrency-safe:** lock order `payment → order → outbox → doc sequence → refund doc`; never allow two refunds to commit concurrently for the same payment; unique constraint `(payment_id, provider_refund_id)` and `(payment_id, idempotency_key)`.
- **Subscription effect separate:** refund of cash does NOT automatically revoke or credit the subscription; that is a separate policy decision (auto-prorate vs keep active vs schedule cancellation). The reconciliation layer will flag any divergence (refund issued but subscription still active, etc.) until an explicit recovery path is approved.

## Tax / legal boundary reminder
- `seller_tax_id` on invoices is null by default. Platform legal must approve the exact seller legal name, tax ID, and footer before these are populated. This is documented at the FinancialDocumentService layer (`seller_tax_id => null`).
- Invoice numbering is per-owner per-month in the Persian calendar (e.g. `INV-1403-08-0001`). Reset cadence (monthly vs annual) and sequence-per-owner (org vs platform-wide) MUST be approved by finance before GA; current implementation is per-owner per-month which is the conservative choice for most Iranian SaaS tax invoicing conventions but can be re-pointed at a platform-wide sequence if finance prefers.

## Reconciliation → Refund workflow (future)
1. Sweep surfaces a finding (e.g. `payment_amount_mismatch` severity=critical).
2. Platform finance operator reviews evidence (PSP trace, order snapshot).
3. If policy authorizes refund, operator triggers the (future) refund command — not automatic.
4. Refund request is sent to PSP; webhook confirmation flips refund doc to issued.
5. Reconciliation auto-resolves the original finding only after refund doc + provider confirmation exist.
6. All events are audit-logged and available to the owner via the document history endpoint.
