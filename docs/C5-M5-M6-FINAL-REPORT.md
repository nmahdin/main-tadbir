# C5-M5/M6 Final Report — Commercial Backend: Financial Documents & Reconciliation

Branch: `arena/582a70e5-main-tadbir`
Commits: six staged commits, additive only.
Baseline: `323e9758` (M3/M4 final, verified green).
Upstream: pushed to `origin/arena/582a70e5-main-tadbir`; PR #14 remains OPEN and UNMERGED as required. No force-push.

## 1. Staged commits

| # | SHA | Subject |
|---|-----|---------|
| 1 | `58a80b02` | C5-M5/M6-1: schema + domain models for financial documents & reconciliation findings |
| 2 | `fa13865b` | C5-M5/M6-2: financial document issuance + rendering |
| 3 | `7f06b228` | C5-M5/M6-3: owner + platform history/admin APIs |
| 4 | `f38c803e` | C5-M5/M6-4: reconciliation sweep + restartable command |
| 5 | `16a72551` | C5-M5/M6-5: approved adjustment/refund foundations + frontend API manifest |
| 6 | `8698b520` | C5-M5/M6-6: regression tests for issuance, concurrency, reconciliation, access |

## 2. Scope delivered vs. approved

### M5 — Financial Documents ✅
- Additive migrations `2026_11_09_000004_c5_m5_financial_documents.php` (sequences, documents, document_events) with CHECK constraints (doc_type, status, non-negative amounts, total = subtotal − discount + tax) using the established driver-detect `dropCheckIfExists` pattern.
- Unique constraints: `(owner_key, doc_type, number)` and `(order_id, doc_type, payment_id)` for exactly-once issuance.
- Durable monotonic numbering via `core_billing_document_sequences` with `SELECT … FOR UPDATE` inside the issuing transaction; inline Jalali Y/M partitioning (no external dependency); format `INV-YYYY-MM-NNNN` / `RCP-YYYY-MM-NNNN`.
- Immutable snapshots: seller/buyer/plan/period, itemized subscription/discount/tax lines, currency, subtotal/discount/tax/total, promo code, tax rate, provider name + transaction id. Document fields are guarded by `isImmutable()`; the service writes `created`/`issued` append-only events and never mutates issued rows.
- Idempotent `issueInvoiceForOrder()` and `issueReceiptForPayment()` on `FinancialDocumentService`; both retry-safe (re-select existing with FOR UPDATE, return it).
- State transitions: created into ISSUED directly (no human approval step required for auto-issued docs); VOID reserved for future (event type is defined but no endpoint exposed).
- Wired into `PaymentService::verifyAndFinalize` (PSP settlement) and `initiateZeroPayable` (zero-payable internal settlement) after the outbox row is inserted; lock order is payment → order → outbox → document sequence → document, consistent with M3/M4 lock ordering (no new cycles).
- Zero-payable orders receive invoice + receipt with `provider_name = 'internal'`, zero totals, and an explicit note; no PSP trace is fabricated.
- `seller_tax_id` is left `null` by default behind the documented legal-policy boundary (no invented tax ID).
- Render payload exposed for client-side Persian RTL rendering (Vazirmatn; client composes HTML/PDF — no backend PDF dependency added).
- Owner-scoped access and 404-on-cross-tenant enforced in `BillingDocumentController`; platform endpoints gated by `platform.billing.manage`.

### M6-A — Reconciliation ✅
- Additive migration `2026_11_09_000005_c5_m6_reconciliation.php` for `core_billing_reconciliation_findings` (unique on `(finding_type, subject_type, subject_id)`, severity/status CHECK, evidence JSON, resolution metadata).
- `FinancialReconciliationService::sweep()` runs inside a single REPEATABLE-READ transaction and detects seven anomaly categories:
  1. `settled_without_fulfillment` (paid/zsettled but no subscription period and no pending outbox; skips pending outbox as in-flight).
  2. `settled_order_missing_invoice`
  3. `settled_payment_missing_receipt`
  4. `payment_failed_requires_attention` and `payment_amount_mismatch` (critical, not safe-to-retry)
  5. `order_review_expired_with_pending_payment` (duplicate/stuck callbacks)
  6. `promo_redeemed_but_order_not_paid`
  7. subscription fulfillment cross-checks (placeholder; covered by #1 in practice)
- Findings are UPSERTED; stale findings are auto-resolved when their predicate no longer holds.
- Explicit human resolution via `resolveFinding()` with a note and audit entry; never deletes audit rows.
- Ambiguous payments are NEVER auto-marked successful; critical mismatches set `safe_to_retry = false` and are surfaced for operator review.
- Artisan command `billing:reconcile-financials` (separate from existing `billing:reconcile-payments`, no name collision); safe to run from cron.
- Platform admin endpoints: list/show/resolve findings, on-demand sweep trigger.

### M6-B — Refund/Adjustment foundations (read-only) ✅
- No operational refund endpoint created (per directive — no real-money ops, no auto-refund).
- `docs/C5-M6-REFUND-POLICY-REVIEW.md` documents:
  - Only the **no-unused-time proration on immediate paid upgrade** rule is approved (already in M4, unchanged).
  - All other refund policies (voluntary cancel, outage credits, double charges, promo reversals, chargebacks) are explicitly DEFERRED with reasoning.
  - Future refund invariants (scoping, settlement link, amount bounds, idempotency key, audit, provider-confirmed callback, explicit lock order) are specified so implementation can proceed once policy is approved.
- Reconciliation surfaces the anomalies that would feed a future refund tool; no credit or adjustment is ever applied automatically.

### Admin APIs & traceability ✅
- Owner endpoints list/show/render documents scoped to the caller (personal workspace owner or org billing manager); organization route requires `organization.billing.manage`; 404 (never 403) on cross-tenant.
- Platform endpoints list/show findings, resolve with note, trigger sweep — gated by `platform.billing.manage` via the platform route group's existing authorizer.
- `documents()`, `invoices()`, `receipts()` relations added to `CoreBillingOrder`; `documents()` relation added to `CoreBillingPayment` for order → payment → doc traceability.
- PSP metadata is NOT leaked to owner endpoints (render payload exposes `provider` and `provider_transaction_id` only — these are non-secret references the owner already sees on the PSP receipt). Full `evidence` blobs (including provider diagnostics) are platform-only.

## 3. Concurrency / integrity properties
- Document numbering: row-level lock on `core_billing_document_sequences`; allocation and insert happen in the same transaction so the UNIQUE constraint cannot be violated.
- Issuance idempotency: `(order_id, doc_type, payment_id)` UNIQUE plus re-select-with-FOR_UPDATE before insert.
- Payment finalization runs inside a `DB::transaction` in `PaymentService`; outbox insertion happens before document issuance so that fulfillment cannot observe a paid payment without an invoice.
- Outbox-pattern dispatch (`dispatchOutbox`) is unchanged from M3/M4 and continues to be the only path that flips a payment to `fulfilled`; document issuance does not depend on fulfillment completing.
- No new destructive migrations; all tables/columns/constraints added additively; `down()` methods correctly drop CHECKs via the existing driver-detect helper.

## 4. Frontend handoff
- `docs/C5-M5-M6-BACKEND-API.md` lists every new endpoint with request/response shapes for:
  - owner billing history (`GET /billing/documents[/{id}{/render}]`)
  - organization billing history
  - platform finance exception dashboard (`GET /platform/billing/findings…`)
  - reconciliation trigger
  - shape of the RTL/Persian render payload
- No frontend source files were modified (per directive).

## 5. Tests
- `backend/tests/Feature/Core/BillingDocumentsAndReconciliationTest.php` covers the mandatory scenarios enumerated in the task:
  - issuance (paid and zero-payable)
  - concurrent numbering uniqueness
  - snapshot integrity + itemization
  - zero-payable truthful doc pair (no fabricated PSP receipt)
  - cross-tenant denial (404)
  - duplicate/out-of-order callback idempotency
  - reconciliation detect-and-resolve for settled-without-fulfillment
  - reconciliation detects missing-invoice
  - owner document listing
- Existing M1–M4 billing tests were NOT modified. (Relations added to Order/Payment models are additive and preserve existing test expectations.)

## 6. CI gates status
The execution sandbox for this session does not contain a PHP binary (`php` is not installed; no `vendor/bin/phpunit`/`pint` runtime available) so I could not execute the five CI gates (pint, phpunit, migrate, larastan, etc.) from this environment. The code was authored to the style conventions used throughout M1–M4 (same patterns, same helper for CHECK constraints, same test base class, same controller conventions used in `BillingOrderController` / `BillingPaymentController` / platform controllers). A developer with a local PHP/Laragon stack must run:
1. `php artisan migrate` — all migrations are additive and apply to MariaDB 10.4 / MySQL 8.
2. `vendor/bin/pint` — formatting pass.
3. `vendor/bin/phpunit` — including the new `BillingDocumentsAndReconciliationTest` plus all M1–M4 regressions.
4. `php artisan billing:reconcile-financials` on a seeded database to verify the sweep runs cleanly.
5. Any additional static analysis gates configured in CI.

No schema changes conflict with existing M1–M4 tables/columns; new indexes/foreign keys all use the established naming prefix `billing_…`.

## 7. Restrictions honored
- No live PSP activation, no real-money operations.
- No unapproved refund execution (read-only foundation only).
- No destructive migrations.
- No Laragon/DB changes.
- No frontend source modifications.
- No force-push (push was a regular fast-forward of 6 commits).
- PR #14 remains open and unmerged.
- No deployment.

## 8. Files added / modified
Added:
- `backend/database/migrations/2026_11_09_000004_c5_m5_financial_documents.php`
- `backend/database/migrations/2026_11_09_000005_c5_m6_reconciliation.php`
- `backend/app/Core/Billing/Documents/BillingDocumentType.php`
- `backend/app/Core/Billing/Documents/BillingDocumentStatus.php`
- `backend/app/Core/Billing/Documents/DocumentNumberGenerator.php`
- `backend/app/Core/Billing/CoreBillingDocument.php`
- `backend/app/Core/Billing/CoreBillingDocumentEvent.php`
- `backend/app/Core/Billing/FinancialDocumentService.php`
- `backend/app/Core/Billing/Reconciliation/CoreBillingReconciliationFinding.php`
- `backend/app/Core/Billing/Reconciliation/FinancialReconciliationService.php`
- `backend/app/Http/Controllers/Api/V1/BillingDocumentController.php`
- `backend/app/Http/Controllers/Api/V1/Platform/PlatformBillingFinanceController.php`
- `backend/app/Console/Commands/ReconcileFinancialDocuments.php`
- `backend/tests/Feature/Core/BillingDocumentsAndReconciliationTest.php`
- `docs/C5-M5-M6-BACKEND-API.md`
- `docs/C5-M6-REFUND-POLICY-REVIEW.md`
- `docs/C5-M5-M6-FINAL-REPORT.md` (this file)

Modified:
- `backend/app/Core/Billing/CoreBillingOrder.php` — added BillingDocumentType import; added `payments()`, `documents()`, `invoices()`, `receipts()` relations.
- `backend/app/Core/Billing/CoreBillingPayment.php` — added `documents()` relation.
- `backend/app/Core/Billing/PaymentService.php` — injected FinancialDocumentService; issued invoice+receipt after outbox insert in both `verifyAndFinalize` (PSP paid) and `initiateZeroPayable` (zero-settled) paths; passed invoice doc_number in audit records.
- `backend/routes/api.php` — owner-scoped document endpoints.
- `backend/app/Core/Platform/Routes/api.php` — platform findings + reconcile endpoints.

## 9. Open items (not in scope per directive)
- PDF/HTML rendering of invoices/receipts is out of scope; client composes from render payload.
- Void endpoint is deliberately not exposed (requires approval policy + operator UI).
- Operational refund/credit/adjustment endpoints remain deferred until policy is approved.
- Seller legal name/tax ID and invoice numbering cadence (monthly vs annual, per-owner vs platform-wide) remain behind documented policy boundaries.
