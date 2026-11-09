# C5-M5/M6 Backend API Manifest

Frontend handoff for Commercial Billing M5 (Financial Documents) and M6 (Reconciliation/Adjustment foundations). Endpoints below are additive; no existing M1–M4 endpoints have breaking changes.

All endpoints are under `/api/v1` and require authentication (session cookie + CSRF where applicable). Monetary values are signed BIGINT Toman (integer Rials/Toman as configured — whole integer, never float). Timestamps are ISO-8601 UTC. RTL/Persian fields are returned as raw strings; client renders with approved Vazirmatn typography and RTL direction.

---

## 1. Orders / Payments (unchanged, now with document linkage)

Responses from existing endpoints gain a `documents` key when eager-loaded by the backend (future). For now, documents are fetched from the dedicated endpoints below.

- `GET /api/v1/billing/orders/{id}` — returns order plus `documents` via join in future paginated list.
- `GET /api/v1/billing/payments/{id}` — returns payment; receipts linked via `GET /billing/documents?payment_id=…`.

---

## 2. Financial Document History (owner-scoped)

### `GET /api/v1/billing/documents`
Personal workspace financial history.

Query params:
- `type` optional: `invoice` | `receipt`
- `order_id` optional int
- `page`, `per_page` (1..100, default 25)

Response:
```json
{
  "data": { "documents": [ DocumentSummary, … ] },
  "meta": { "per_page": 25, "current_page": 1, "last_page": 4, "total": 87 }
}
```

### `GET /api/v1/billing/documents/organizations/{organization}`
Same shape; requires `organization.billing.manage` permission on the organization. Returns 403 otherwise. Cross-tenant access returns 404 at single-document endpoints to avoid existence leakage.

### `GET /api/v1/billing/documents/{document}`
Detail for a single document. Requires ownership (org billing.manage or personal owner). Returns 404 if not owned.

`DocumentSummary` shape:
```json
{
  "id": 123,
  "type": "invoice" | "receipt",
  "status": "issued" | "void",
  "number": "INV-1403-08-0001",
  "owner_key": "ws:42" | "org:7",
  "order_id": 900,
  "payment_id": 1001,
  "related_invoice_id": null | 122,
  "currency": "TOMAN",
  "subtotal_toman": 500000,
  "discount_toman": 0,
  "tax_toman": 45000,
  "total_toman": 545000,
  "issued_at": "2026-10-15T12:00:00Z",
  "voided_at": null,
  "created_at": "2026-10-15T12:00:00Z"
}
```

### `GET /api/v1/billing/documents/{document}/render`
Returns data required to render a Persian/RTL invoice/receipt (HTML or PDF in client). Response:
```json
{
  "data": {
    "render": {
      "doc_number": "INV-1403-08-0001",
      "doc_type": "invoice",
      "status": "issued",
      "issued_at": "2026-10-15T12:00:00Z",
      "seller":   { "name": "TADBIR", "tax_id": null },
      "buyer":    { "name": "personal:42", "contact": null },
      "plan":     { "name": "Pro", "version_id": 5, "period": "monthly" },
      "currency": "TOMAN",
      "items": [
        { "kind": "subscription", "description": "Pro", "period": "monthly", "quantity": 1, "unit_amount_toman": 500000, "amount_toman": 500000 },
        { "kind": "discount",     "description": "Promo: WELCOME", "quantity": 1, "unit_amount_toman": -50000, "amount_toman": -50000 },
        { "kind": "tax",          "description": "Tax", "quantity": 1, "unit_amount_toman": 40500, "amount_toman": 40500 }
      ],
      "totals": { "subtotal_toman": 500000, "discount_toman": 50000, "tax_toman": 40500, "total_toman": 490500 },
      "tax_rate": "9%",
      "promo_code": "WELCOME",
      "payment": { "provider": "zibal" | "internal", "transaction_id": "ZBL-…" },
      "notes": null | "Zero-payable settlement (authorized without PSP transaction)."
    }
  }
}
```

Notes:
- For zero-payable orders, receipts use `"provider": "internal"` and no fabricated PSP trace.
- `seller.tax_id` is null by default (legal/tax-registration policy boundary; to be filled once a platform policy is approved).
- Download/PDF generation is out of scope for M5; client composes render data into a printable page (RTL CSS).

---

## 3. Platform Financial Admin (platform.billing.manage)

All under `/api/v1/platform/billing/…`. Requires platform staff authorization.

### `GET /api/v1/platform/billing/findings`
List reconciliation findings. Query params:
- `severity`: `info` | `warning` | `error` | `critical`
- `status`: `open` | `resolved`
- `finding_type`: e.g. `settled_without_fulfillment`, `settled_order_missing_invoice`, `settled_payment_missing_receipt`, `payment_amount_mismatch`, `payment_failed_requires_attention`, `order_review_expired_with_pending_payment`, `promo_redeemed_but_order_not_paid`
- `per_page` (1..200)

`FindingSummary`:
```json
{
  "id": 1,
  "finding_type": "settled_without_fulfillment",
  "subject_type": "payment",
  "subject_id": 1001,
  "severity": "error",
  "status": "open",
  "message": "Payment settled but subscription fulfillment did not complete.",
  "safe_to_retry": true,
  "owner_key": "ws:42",
  "related_payment_id": 1001,
  "related_order_id": 900,
  "detected_at": "2026-10-15T12:05:00Z",
  "resolved_at": null,
  "resolved_by_user_id": null,
  "resolution_note": null
}
```

### `GET /api/v1/platform/billing/findings/{finding}`
Single finding with `evidence` JSON blob (redacted PII/PSP metadata).

### `POST /api/v1/platform/billing/findings/{finding}/resolve`
Mark an open finding resolved with a human note. Body: `{ "resolution_note": "string (max 2000)" }`. Does NOT auto-correct underlying state.

### `POST /api/v1/platform/billing/reconcile`
Trigger an on-demand reconciliation sweep. Returns summary:
```json
{ "data": { "summary": { "opened": 2, "resolved": 0, "total_open": 5 } } }
```
The same sweep runs on schedule via `php artisan billing:reconcile-financials`.

### Order → Payment → Document traceability
Platform controllers (future) can compose: `order` → `payments[]` → `documents[]` (new relations added to `CoreBillingOrder` / `CoreBillingPayment` in M5). No dedicated endpoint in M5; use existing platform order view plus the document index filtered by `order_id`.

---

## 4. Refund / Adjustment foundations (read-only in M6-B)

No operational refund endpoint is shipped. The reconciliation findings surface refund-relevant anomalies (amount mismatch, promo inconsistency, double payment) for operator review. A future refund command/endpoint will require:
- Owner + `organization.billing.manage` (or platform role) scoping,
- linkage to a verified `settled` payment with a real `provider_transaction_id`,
- amount-bounded by the original captured amount,
- idempotency keyed by (payment_id, idempotency_key),
- durable audit (refund event + document event),
- provider-confirmed callback before crediting subscription credit,
- explicit locking (payment → order → outbox → refund doc).
- No proration is approved except the **no-unused-time proration on immediate paid upgrade** rule already covered by M4.

Document refund policies live in `docs/C5-M6-REFUND-POLICY-REVIEW.md`.

---

## 5. Indicators for frontend consumption
- `billing.documents.index` for “Billing history / Invoices & Receipts” screens.
- `billing.documents.render` for “Download invoice/receipt” (print dialog).
- Platform: `billing.findings.index` for “Finance exceptions” dashboard; badge count = `total_open` from latest sweep.
- Cross-tenant calls return 404 (never 403) to avoid enumeration.
