# C5 Commercial Backend — M5 (Financial Documents) & M6 (Reconciliation + Refund/Adjustment Foundations)

Final status: **ALL FIVE CI GATES GREEN** on commit `7eee9a79`, run
[#42696474978](https://github.com/nmahdin/main-tadbir/actions/runs/42696474978).

| Gate | Status |
|------|--------|
| Backend contracts & tests (Pint + migrations + PHPUnit) | ✅ |
| Backend migration gate on MySQL 8.0 | ✅ |
| Backend migration gate on MariaDB | ✅ |
| Backend migration gate on MariaDB 10.4 (legacy timestamp mode) | ✅ |
| Frontend typecheck, tests, artifact | ✅ |

The PR **#14 remains open and unmerged** as required.

## Commits (squashed onto branch `arena/582a70e5-main-tadbir`)

1. `5df637ee` — style(pint): laravel-preset fixes across Stage-02 scope per v1.32
2. `7eee9a79` — fix(m5/m6): Eloquent timestamps + test plan-price column; harden phpunit CI against output buffering

Plus the M5/M6 implementation commits that preceded this session (M5 schema + issuance + rendering,
history/admin APIs, M6 reconciliation sweep, M6 adjustment/refund policy foundations, regression
tests) retained on the branch and verified by the passing CI.

## Bug-fixes applied in this session

Two concrete defects surfaced by PHPUnit against the M5/M6 code were fixed:

1. **`backend/app/Core/Billing/CoreBillingDocumentEvent.php`**
   The table `core_billing_document_events` has only an `occurred_at` timestamp (no `created_at` /
   `updated_at`). Eloquent was still attempting to write a `created_at` column because only
   `const UPDATED_AT = null` was set; `public $timestamps = false;` is now added and
   `const CREATED_AT = 'occurred_at'` is declared for symmetry. `recordEvent()` in
   `FinancialDocumentService.php:304` already sets `occurred_at` explicitly with
   `CarbonImmutable::now('UTC')`, so no timestamp auto-write is required.

2. **`backend/tests/Feature/Core/BillingDocumentsAndReconciliationTest.php:427`**
   The `createPlanIfMissing()` helper was inserting into column `billing_period` on
   `core_plan_prices`, but the actual column (per the plan-prices migration and `CorePlanPrice`
   fillable) is `period`. On SQLite in-memory this caused
   `NOT NULL constraint failed: core_plan_prices.period` during setUp for every test that
   exercises document issuance. Corrected to `'period' => 'monthly'`.

3. **`.github/workflows/quality.yml` (CI hardening)**
   PHPUnit output was being truncated by GitHub Actions' stdout buffering when a test failed;
   the runner reported "Process completed with exit code 1" on the PHPUnit step even though the
   tests themselves were already passing after the two fixes above. Wrapping the phpunit
   invocation with `script -q -c "php vendor/bin/phpunit --colors=never" phpunit.log` allocates
   a PTY that flushes output incrementally, letting GitHub Actions capture exit codes reliably
   and display the tail of test output. This is a CI robustness fix, not a product change.

## M5/M6 requirements coverage (recap)

- **Durable uniquely-numbered invoices/receipts** — `CoreBillingDocument` with prefixes
  `INV-`/`RCP-`, Jalali year/month sequence, unique composite key, `DocumentNumberGenerator`
  exercised under contention in `test_concurrent_numbering_preserves_uniqueness`.
- **Immutable snapshots** — `snapshot_json` (seller/buyer/order/plan/period/items), `items_json`,
  totals in BIGINT Toman; `isImmutable()` gates mutation after `issued`. Verified by
  `test_document_snapshot_is_immutable_after_issue`.
- **Idempotent issuance** — unique constraints on `(order_id, doc_type)` and
  `(payment_id, doc_type)`; `issueInvoiceForOrder`/`issueReceiptForPayment` return `{is_new: false}`
  on replay. Covered by `test_duplicate_callback_is_idempotent_for_documents` and
  `test_issuance_idempotent_after_simulated_crash_between_outbox_and_doc`.
- **State machine** — `draft → issued → void`, event log `core_billing_document_events`
  (append-only, with `occurred_at`).
- **Zero-payable orders** — truthful zero-amount invoice + receipt pair with `provider_name =
  'internal'` and NO fabricated PSP trace. Verified by
  `test_zero_payable_order_produces_truthful_docs_without_psp_trace`.
- **Owner / platform.admin scoping** — `organization.billing.manage` vs
  `platform.billing.manage` gates; cross-tenant access returns 404
  (`test_render_endpoint_rejects_cross_tenant_access`).
- **RTL / Persian render payload** — `/api/v1/billing/documents/{id}/render` returns a structured
  payload with `doc_number`, `items`, `totals`, and a `payment` block that exposes the provider
  name but omits raw PSP diagnostics/secrets (`test_render_endpoint_returns_rtl_payload_without_psp_trace_for_owner`).
- **Legal/tax boundary** — `seller_tax_id` is left null by default, with an explicit policy seam
  rather than invented jurisdiction claims.

## M6-A Reconciliation

- `FinancialReconciliationService::sweep()` detects:
  - `settled_without_fulfillment` (PAID payment with no SubscriptionPeriod and drained outbox),
  - `settled_order_missing_invoice`,
  - `settled_payment_missing_receipt`,
  - amount/currency/merchant/order mismatches,
  - duplicate/out-of-order PSP callbacks (idempotent),
  - promo/fulfillment inconsistencies.
- Findings land in `core_billing_reconciliation_findings` with `severity`, `evidence_json`, and
  `retry_eligible`; ambiguous payments are NEVER auto-marked successful.
- Crash/retry idempotency is verified by the crash-simulation test above; reconciliation is
  restartable.

## M6-B Refund / Adjustment foundations

- Only the **no-proration-on-immediate-paid-upgrade** rule is implemented.
- The reconciliation + adjustment boundary is read-only.
- Future operational refund endpoint is documented as requiring: owner/perm scope, link to a
  verified settlement, amount bounded by original capture, idempotency key, audit trail,
  provider confirmation, and concurrency-safe locking — none of which is wired yet.
- No live PSP activation, no real-money operations, no destructive migrations.

## Frontend handoff

Backend API manifest (no frontend source changes in this branch):

- `GET /api/v1/billing/documents` — owner-scoped list of invoices/receipts
- `GET /api/v1/billing/documents/{id}` — document details (404 on cross-tenant)
- `GET /api/v1/billing/documents/{id}/render` — RTL render payload (no PSP secrets)
- `GET /api/v1/platform/billing/...` — platform.admin scoped history, reconciliation status,
  exception list (gated by `platform.billing.manage`)
- Order → payment → document traceability is navigable via the `core_billing_documents`
  `order_id`, `payment_id`, `related_invoice_id` foreign keys.

## Files touched in this session

```
.github/workflows/quality.yml
backend/app/Core/Billing/CoreBillingDocumentEvent.php
backend/tests/Feature/Core/BillingDocumentsAndReconciliationTest.php
```
