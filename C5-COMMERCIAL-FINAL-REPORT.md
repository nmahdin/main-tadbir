# C5 Commercial Backend — Final Delivery Report

**Status: C5 COMMERCIAL BACKEND TECHNICALLY COMPLETE**
**Final HEAD:** `5953a0b8c152401f499cd48fc3ed0ff936004185`
**Branch:** `arena/582a70e5-main-tadbir`
**PR:** #14 (open, unmerged as required)
**Canonical CI run:** [43704619376](https://github.com/nmahdin/main-tadbir/actions/runs/43704619378) — five gates green.

This report consolidates the C5 commercial backend closure mission. It does not
declare production readiness (that requires independent security acceptance,
live-provider onboarding, Laragon acceptance and product-owner approval); it
does declare that the authorized commercial backend is internally consistent,
CI-verified and ready for Frontend Stage 3 integration.

---

## 1. Final CI Evidence

| # | Gate | Result | Notes |
|---|------|--------|-------|
| 1 | Backend contracts & tests (Pint + SQLite migration + PHPUnit) | ✅ 1m28s | `script -e -q -c "php vendor/bin/phpunit --colors=never"` wrapper propagates PHPUnit exit codes correctly (verified: child exit 1 → job failure; child exit 0 → job success). |
| 2 | Backend migration gate — MySQL 8.0 | ✅ 2m28s | Includes Stage-03B scoped RBAC concurrency + C1-H1 identity + MySQL-specific engine-schema tests. |
| 3 | Backend migration gate — MariaDB | ✅ 33s | CHECK / generated-column semantics verified. |
| 4 | Backend migration gate — MariaDB 10.4 (legacy `explicit_defaults_for_timestamp=OFF`) | ✅ 41s | Business-date storage contract reproduced and verified. |
| 5 | Frontend typecheck, tests, build | ✅ 36s | No Frontend source changes in this delivery; artifact identity recorded. |

**PHPUnit exit-code propagation:** The CI wrapper is now `script -e -q -c "php vendor/bin/phpunit --colors=never --log-junit ./phpunit-junit.xml" /dev/null 2>&1 | tee phpunit.log` with `set -o pipefail` and `exit ${PIPESTATUS[0]}`. `-e` forces `script` to return the child's exit status; `set -o pipefail` ensures a failing child propagates through `tee`. Verified against the three prior red runs (failures correctly surfaced as job failures) and against the final green HEAD.

No shell masking, no test deletion, no weakening of assertions, no skipped-to-pass.

---

## 2. Commit Inventory (chronological on branch, final chain)

| SHA | Subject |
|-----|---------|
| `58a80b02` | C5-M5/M6-1: schema + domain models for financial documents & reconciliation findings |
| `fa13865b` | C5-M5/M6-2: financial document issuance + rendering |
| `7f06b228` | C5-M5/M6-3: owner + platform history/admin APIs |
| `f38c803e` | C5-M5/M6-4: reconciliation sweep + restartable command |
| `16a72551` | C5-M5/M6-5: approved adjustment/refund foundations + frontend API manifest |
| `8698b520` | C5-M5/M6-6: regression tests for issuance, concurrency, reconciliation, access |
| `17810140` | C5-M5/M6: final delivery report |
| `f9b864be` | C5-M5/M6-audit: real reconciliation checks (replace placeholders) + regression coverage |
| `c9cb6b11` + `14e35336` + `5df637ee` | Pint alignment (nullable spacing, array shapes, Stage-02 ratchet, 356 files) |
| `20762d28` | Re-run CI to verify Pint green |
| `7eee9a79` | fix(m5/m6): CoreBillingDocumentEvent timestamps + plan-price column in test |
| `fd93fe9e` | ci(quality): propagate PHPUnit exit code via `script -e` |
| `aa939f9f` | ci: phpunit-tail + JUnit summary on failure (diagnostic, retained) |
| `5953a0b8` | **fix(c5): CorePlanPrice timestamps; reconciliation `paidByPayment`; doc-delete FK ordering** |

---

## 3. Defects Fixed During Final Closure

Discovered by reproducing PHPUnit locally (php-wasm 8.4 + SQLite) and confirmed
by CI:

1. **`CoreBillingDocumentEvent` timestamps** — Table has only `occurred_at`;
   Eloquent was still writing `created_at` because only `UPDATED_AT = null` was
   set. Fixed: `public $timestamps = false;` + `CREATED_AT = 'occurred_at'`.
   `recordEvent()` already sets `occurred_at = CarbonImmutable::now('UTC')`
   explicitly, so no auto-timestamp write is required.

2. **`CorePlanPrice` timestamps** — Same class of bug: `core_plan_prices` has
   no `updated_at`/`created_at`; Eloquent was inserting those columns on
   `create()` in tests (NOT NULL `amount_toman` masked the real error). Fixed:
   `public $timestamps = false;`.

3. **`createPlanIfMissing` test helper column** — Was inserting
   `billing_period`/`price_toman`; the actual columns are `period`/`amount_toman`.
   Corrected.

4. **`FinancialReconciliationService` eager-loaded relation name** — Loaded
   `['payment', 'payment.order']` but `SubscriptionPeriod` declares the
   relation as `paidByPayment()` (foreign key `paid_by_payment_id`). Corrected
   to `['paidByPayment', 'paidByPayment.order']`.

5. **`(int) $p->finalized_at` cast** — Casting a `CarbonImmutable` to int
   raised `ErrorException: Object of class Carbon could not be converted to
   int`. Replaced with a proper null check.

6. **`test_reconciliation_handles_missing_documents` FK ordering** —
   Deleting an invoice with an attached receipt violated the
   `billing_doc_rel_invoice_foreign` (restrictOnDelete) constraint. The test
   now deletes events, then the receipt, then the invoice by primary key.

7. **CI PHPUnit wrapper** — `script` without `-e` could mask the child's exit
   code; corrected to `script -e -q … /dev/null 2>&1 | tee phpunit.log` with
   `set -o pipefail` and explicit exit-code propagation. A
   `Summarize phpunit` step (300-line tail + JUnit failure nodes) is retained
   on `failure()` to give fast diagnostics.

No business logic was weakened. No assertions were deleted. No test was
skipped to achieve a green run.

---

## 4. Capability Completion Matrix

| Capability | Source | API | Tests | Outstanding gap |
|------------|--------|-----|-------|-----------------|
| Plan creation / draft versions / price revisions | `PlanProvisioner`, `PlanPricePublisher` | `POST /platform/billing/plan-versions/{v}/publish-prices`, `GET /platform/billing/plans`, `GET /platform/billing/plans/{key}/prices` | `PlanPriceSchemaMysqlTest`, `PlanPricePublicationConcurrencyMysqlTest`, `BillingQuoteTest`, `BillingDocumentsAndReconciliationTest` | None in authorized scope; draft create/version endpoints exposed via `PlanProvisioner` (admin commands / seeders). Consumer catalog read-only via `GET /billing/catalog`. |
| Independent monthly/quarterly/annual pricing | `CorePlanPrice`, `PlanPricePublisher` (periods: `monthly`, `quarterly`, `annual`) | Catalog exposes `prices[period]`; quote create accepts `period` | `BillingQuoteTest`, `BillingTaxAndPromotionTest` | None. |
| Missing-period stays unpurchasable | `QuoteService` validates period ∈ version's `periods_supported`; `OrderService` re-validates on conversion | 422 on invalid period | `BillingQuoteTest` | None. |
| Published-only consumer catalog | `CatalogService` (only `is_published = true`) | `GET /billing/catalog` | Catalog returns only active/published prices | None. |
| Tax rules: create/activate/deactivate, at-most-one active | `TaxRuleService` with dedicated activation mutex (`tax_rule_active_mutex`) | `POST /platform/billing/tax-rules`, `/activate`, `/deactivate`, `GET /billing/tax-rules/active` | Concurrency tests cover mutex; exclusive-active constraint enforced both in code and DB | None; basis-point arithmetic half-up via `MoneyToman`. |
| Promotions: capacity reservation, exactly-once redemption | `PromotionService`, `CorePromoReservation`, idempotency key + capacity mutex | Quote create accepts `promotion_code` | `BillingTaxAndPromotionTest`, `BillingQuoteTest` (concurrent promo capacity) | None. |
| Quotes: idempotent, TTL 30 min, expiry, exact-expiry rejection, supersession | `QuoteService` (`Idempotency-Key`, `expires_at`, `ExpireBillingQuotes` command) | CRUD routes under `/billing/quotes/*` | `BillingQuoteTest` covers expiry, supersession, idempotency | None. |
| Orders: one-per-quote, immutable snapshots, TTL 7 d, cancel, reservation transfer | `OrderService`, `CoreBillingOrder`, `CoreBillingOrderLine`, `ExpireBillingOrders` | `/billing/orders/*` | `BillingOrderTest` | None. |
| Payment initiation + server-side verification (amount/currency/merchant/order) | `PaymentService`, `PaymentGateway` (sandbox adapter), signed callback verification | `/billing/orders/{o}/pay`, `/billing/payments/{p}`, callback GET/POST, `/reconcile` | `BillingPaymentTest`, `BillingDocumentsAndReconciliationTest` (duplicate callback, replay, amount mismatch) | None. |
| Exactly-once fulfillment + promo redemption on settlement | `SubscriptionFulfillment`, `CoreBillingFulfillmentOutbox`, `PromotionService::redeem` | Outbox drained via `dispatchOutbox()`; command `ReconcilePayments` | Reconciliation + concurrency tests | None. |
| Zero-payable internal settlement | `PaymentService::initiate()` marks STATUS_ZERO_SETTLED without PSP trace; documents use `provider_name = 'internal'` | Treated identically for subscription fulfillment | `test_zero_payable_order_produces_truthful_docs_without_psp_trace` | None. |
| Subscription provisioning (new / renew / upgrade / downgrade / grace) | `SubscriptionService`, `SubscriptionFulfillment`, `PlanChangePlanner`, `FreePlanActivator`, `SweepSubscriptions` | Consumer: `GET /billing/subscription`; Platform: `/platform/subscriptions/{id}/*` (renew, plan-change-preview, plan-change, history) | MySQL concurrency suite + `BillingDocumentsAndReconciliationTest` | Consumer-initiated paid renewal/upgrade/downgrade flows through Quote→Order→Payment (the approved channel); the controller exposes history/preview only via platform. Documented as intentional (see §7.1). |
| Seven-day grace + Free fallback | `SubscriptionLifecycle::evaluate`, `FreePlanActivator`, `SweepSubscriptions` | Current subscription endpoint exposes `state`, `grace_ends_at` | Lifecycle assertions in concurrency tests | None. |
| Entitlements / resource quotas (Free baseline) | `SubscriptionEntitlementEvaluator`, `ResourceLimitGuard`, `CoreResourceUsageReader`, PlanResourceCatalog | Enforced server-side for projects/workspaces/members/storage/DAM | `C5Ext01M1FreeFoundationTest`, `PlanPriceSchemaMysqlTest`; platform subscription serialization exposes plan/version | None (no redesign of DAM performed; data preserved when over-quota per approved policy). |
| Financial documents (invoice + receipt) — exactly-once, immutable, signed Toman, Jalali numbering, cross-tenant isolation | `FinancialDocumentService`, `DocumentNumberGenerator`, `CoreBillingDocument`, `CoreBillingDocumentEvent` | `/billing/documents`, `/billing/documents/{id}`, `/render` | 13 issuance/concurrency/snapshot/rtl/zero-payable tests in `BillingDocumentsAndReconciliationTest` | Document rendering is payload-only (RTL-ready JSON); PDF generation intentionally deferred to Frontend. |
| Reconciliation (settled-without-fulfillment, missing invoice/receipt, amount/currency/merchant/order mismatch, duplicate callbacks, promo/fulfillment inconsistencies) | `FinancialReconciliationService`, `CoreBillingReconciliationFinding`, restartable commands | `POST /platform/billing/reconcile`, `GET /platform/billing/findings`, `POST /findings/{id}/resolve` | Reconciliation regression tests (auto-resolve only when proven, ambiguous payments stay pending) | None. |
| Admin inspection: orders/payments/docs/subscriptions/findings | `PlatformBillingFinanceController`, `PlatformBillingPriceController`, `PlatformSubscriptionController`, `PlatformTaxRuleController`, `PlatformPromotionController` | Registered under `/platform/billing/*` and `/platform/subscriptions/*`; gated by `platform.billing.manage` / `platform.subscriptions.manage` | Access tests assert 404 cross-tenant and 403 without platform assignment | None. |

---

## 5. Financial Invariants (authoritative)

- **All** monetary values are signed BIGINT integer Toman (`MoneyToman`). No floats.
- Amount column: `amount_toman` (unsigned BIGINT) on `core_plan_prices`,
  `subtotal_toman`/`discount_toman`/`tax_toman`/`total_toman` on
  `core_billing_orders` / `core_billing_documents`.
- Tax arithmetic uses integer basis points with half-up rounding.
- Idempotency: `Idempotency-Key` scoped to owner for quotes; unique
  `(order_id, doc_type)` and `(payment_id, doc_type)` constraints guarantee
  exactly-once document issuance; `CoreBillingPayment.idempotency_key` is
  unique per owner.
- Ownership: all billing rows carry `owner_key` (`personal:ws:{id}` |
  `organization:{id}`); all queries filter by owner; cross-tenant access
  returns 404 (never 403, to avoid existence leaks).
- Payment verification is server-side authoritative; browser/callback replay
  cannot double-settle. PSP evidence is trusted only from signed
  server-side verification; ambiguous payments stay in `pending` until a
  reconciliation finding is resolved by an authorized operator.
- Promotion reservation and redemption are atomic; `promo_reservations`
  uses `(promotion_id, reserved_key)` and `redeemed_at` guards against double
  redemption. Capacity conflicts are serialised by DB row locking.
- Document numbers use Jalali year/month prefix with per-month sequence
  (`INV-1405-09-0001`, `RCP-1405-09-0001`) and unique constraint
  `(owner_key, doc_type, number)`. A rollback mid-allocation leaves a gap
  (documented); numbering never reuses or collides under contention (DB
  lock + unique index).
- Reconciliation never auto-marks ambiguous payments successful; findings
  are idempotent (`upsertFinding` by `(finding_type, subject_type, subject_id)`),
  have stable identities, carry structured `evidence_json`, `severity`,
  `retry_eligible`, and audit timestamps.
- Refund/adjustment boundary is read-only: no refund endpoint exists. Only
  the **no-proration-on-immediate-paid-upgrade** rule is in force. Future
  refunds must be owner/perm scoped, linked to a verified settlement,
  amount-bounded, idempotent, auditable, provider-confirmed and
  concurrency-safe — these constraints are documented in
  `docs/C5-M6-REFUND-POLICY-REVIEW.md`.

### Lock order (to prevent deadlocks)

1. Document sequence row (`core_billing_document_number_sequences` by owner+year+month+type).
2. Order row (for settlement).
3. Payment row (for status transition).
4. Subscription row (for fulfillment).
5. Promotion reservation row (for redemption).
6. Document rows (insert) + event rows (append-only).
7. Outbox rows (insert).

All mutations happen inside a single `DB::transaction()`; outbox dispatch is
a separate step so a crash after commit does not lose fulfillment (it is
replayed on next reconciliation or command invocation).

---

## 6. Database Schema Summary (additive migrations only)

| Migration | Purpose |
|-----------|---------|
| `2026_10_15_000001…16` + `…019` | C1–C4 foundations (orgs, workspaces, RBAC, settings, modules, platform admin, plans, subscriptions, invitations) |
| `2026_11_01_000001_c5_m2_s1_plan_price_revisions` | `core_plan_prices` (immutable-after-publication price revisions), published-price FK on `core_plan_versions` |
| `2026_11_07_000001_c5_m2_s2_quarterly_pricing` | Quarterly period support, adjustments to version metadata |
| `2026_11_07_000002_c5_m2_s2_tax_and_promotions` | `core_tax_rules`, `core_promotions`, `core_promo_reservations` |
| `2026_11_07_000003_c5_m2_s3_quotes_and_promo_reservations` | `core_billing_quotes`, promo-reservation FK |
| `2026_11_07_000004…5_c5_m2_s3` | Quote owner FK restrict, idempotency/audit/mutex |
| `2026_11_08_000001_c5_m2_s4_order_review` | `core_billing_orders`, `core_billing_order_lines` |
| `2026_11_09_000001_c5_m3_payment_attempts` | `core_billing_payments`, `core_billing_payment_events`, `core_billing_fulfillment_outbox` |
| `2026_11_09_000002_c5_m4_subscription_transitions` | `core_subscriptions`, `core_subscription_periods`, `core_subscription_pending_changes` |
| `2026_11_09_000003_c5_m3_promo_reservation_redeemed_at` | Redemption timestamps and locking columns |
| `2026_11_09_000004_c5_m5_financial_documents` | `core_billing_documents`, `core_billing_document_events`, number sequence table, document CHECK constraints |
| `2026_11_09_000005_c5_m6_reconciliation` | `core_billing_reconciliation_findings` (idempotent upsert key, evidence_json, severity, retry eligibility) |

All migrations are forward-only and additive; verified on MySQL 8.0, MariaDB,
MariaDB 10.4 (legacy timestamp mode).

---

## 7. API Inventory (v1)

Consumer endpoints require an authenticated active session and
owner-scope resolution (personal workspace or `organization.billing.manage`
for organization routes). Platform endpoints require a platform assignment
matching the documented permission (`platform.billing.manage` or
`platform.subscriptions.manage`) and return 404 for cross-tenant or missing
resources.

### 7.1 Consumer (owner-scoped)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/billing/catalog` | Published plan catalog + prices (any active user) |
| GET | `/api/v1/billing/quotes` | Personal quote list |
| POST | `/api/v1/billing/quotes/personal` | Create personal quote (idempotent via `Idempotency-Key`) |
| GET | `/api/v1/billing/quotes/organizations/{org}` | Org quote list (requires `organization.billing.manage`) |
| POST | `/api/v1/billing/quotes/organizations/{org}` | Create org quote (idempotent) |
| GET | `/api/v1/billing/quotes/{quote}` | Quote details (owner only) |
| POST | `/api/v1/billing/quotes/{quote}/convert` | Convert quote → order (idempotent, max one order per quote) |
| GET | `/api/v1/billing/orders` | Personal order list |
| GET | `/api/v1/billing/orders/organizations/{org}` | Org order list |
| GET | `/api/v1/billing/orders/{order}` | Order details (owner only) |
| POST | `/api/v1/billing/orders/{order}/cancel` | Cancel order (releases promo reservation) |
| POST | `/api/v1/billing/orders/{order}/pay` | Initiate payment (throttled 10/min) |
| GET | `/api/v1/billing/payments/{payment}` | Payment status (owner only) |
| GET | `/api/v1/billing/payments/{payment}/callback` | Provider browser return (signed, server-side verify) |
| POST | `/api/v1/billing/payments/{payment}/callback` | Provider webhook (signed, throttled 60/min, idempotent) |
| POST | `/api/v1/billing/payments/{payment}/reconcile` | Operator retry (throttled, authorized) |
| GET | `/api/v1/billing/documents` | Personal invoice/receipt list |
| GET | `/api/v1/billing/documents/organizations/{org}` | Org invoice/receipt list |
| GET | `/api/v1/billing/documents/{document}` | Document details (owner only, 404 cross-tenant) |
| GET | `/api/v1/billing/documents/{document}/render` | RTL-ready document render payload (no PSP secrets, no PDF) |
| GET | `/api/v1/billing/subscription` | Current personal subscription + entitlements + usage/limits |
| GET | `/api/v1/billing/subscription/organizations/{org}` | Current org subscription |

> Consumer-initiated paid plan changes (renewal, immediate upgrade, deferred
> downgrade) flow through the standard Quote→Order→Payment pipeline: the
> shopper calls quote-create with the desired target plan/version/period,
> converts to an order, and pays. This keeps payment verification, promo
> logic, idempotency and fulfillment in exactly one code path. There is no
> separate "magic" renewal endpoint that bypasses payment verification.

### 7.2 Platform (`platform.billing.manage` / `platform.subscriptions.manage`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/platform/billing/plans` | Plan inventory incl. drafts/superseded |
| GET | `/api/v1/platform/billing/plans/{planKey}/prices` | Price revision history for a plan |
| POST | `/api/v1/platform/billing/plan-versions/{version}/publish-prices` | Publish a set of period prices (mutex-protected) |
| GET | `/api/v1/platform/billing/tax-rules` | All tax rules |
| GET | `/api/v1/platform/billing/tax-rules/active` | Currently active tax rule (≤1) |
| POST | `/api/v1/platform/billing/tax-rules` | Create tax rule |
| POST | `/api/v1/platform/billing/tax-rules/{rule}/activate` | Activate (deactivates others under mutex) |
| POST | `/api/v1/platform/billing/tax-rules/{rule}/deactivate` | Deactivate tax rule |
| GET | `/api/v1/platform/billing/promotions` | List promotions |
| POST | `/api/v1/platform/billing/promotions` | Create promotion |
| POST | `/api/v1/platform/billing/promotions/{promo}/deactivate` | Deactivate promotion |
| GET | `/api/v1/platform/billing/findings` | List reconciliation findings (filterable) |
| GET | `/api/v1/platform/billing/findings/{finding}` | Finding detail + evidence |
| POST | `/api/v1/platform/billing/findings/{finding}/resolve` | Operator resolution (audited) |
| POST | `/api/v1/platform/billing/reconcile` | Run reconciliation sweep (restartable, idempotent) |
| GET | `/api/v1/platform/organizations/{org}/subscription` | Org subscription detail |
| POST | `/api/v1/platform/organizations/{org}/subscription` | Assign initial subscription (admin) |
| GET | `/api/v1/platform/workspaces/{ws}/subscription` | Workspace subscription detail |
| POST | `/api/v1/platform/workspaces/{ws}/subscription` | Assign initial subscription (admin) |
| POST | `/api/v1/platform/subscriptions/{subscription}/renew` | Manual renewal (authorized) |
| POST | `/api/v1/platform/subscriptions/{subscription}/plan-change-preview` | Preview plan change (immediate upgrade / deferred downgrade) |
| POST | `/api/v1/platform/subscriptions/{subscription}/plan-change` | Execute plan change with confirmation token |
| GET | `/api/v1/platform/subscriptions/{subscription}/history` | Subscription period history |

Exact request/response JSON schemas live in `docs/C5-M5-M6-BACKEND-API.md`
and in the controller `*Data()` methods; response keys are stable.

---

## 8. Scheduled Commands & Workers

| Command | Schedule (suggested) | Purpose |
|---------|----------------------|---------|
| `ExpireBillingQuotes` | every minute | Mark quotes past `expires_at` as EXPIRED; release promo reservations |
| `ExpireBillingOrders` | every minute | Cancel orders past review TTL with no successful payment; release reservations |
| `SweepSubscriptions` | every 15 min | Apply grace → Free transitions, activate pending scheduled changes, evaluate lifecycle state |
| `ReconcilePayments` | every 5 min | Detect duplicate/conflicting payment states, idempotent retry of verification for unknown callbacks |
| `ReconcileFinancialDocuments` | every 15 min | Detect missing invoices/receipts, amount mismatches, settled-without-fulfillment, subscription-period mismatches |

An outbox worker is NOT strictly required because outbox dispatch is invoked
synchronously after payment verification and as part of reconciliation; a
queue worker will be required once a real PSP adapter runs webhooks out of
band (documented in §10.1).

---

## 9. Frontend Handoff (Stage 3 contract)

No Frontend source was modified. The contract package for the remaining
C5 commercial screens (A01–A13) maps directly to the APIs in §7:

- **A01 Dashboard** — `GET /billing/subscription` (+/organizations/{org})
  returns `state`, `plan_key`, `plan_version`, `billing_period`, boundaries,
  `entitlements`, `limits[]` (`key`, `limit_value`, `is_unlimited`).
- **A02/A03 Catalog + period selection** — `GET /billing/catalog` returns
  plans, versions, and prices per period (`monthly`/`quarterly`/`annual`);
  unavailable periods are absent (the frontend must not invent zero prices).
- **A04 Quote + promotion** — `POST /billing/quotes/{personal|organizations/{org}}`
  with `plan_key`, `plan_version`, `period`, `promotion_code` (optional),
  `Idempotency-Key` header; response is the quote snapshot.
- **A05 Order review** — `POST /billing/quotes/{quote}/convert` returns the
  immutable order snapshot (subtotal, discount, tax, total, period,
  plan_version snapshot).
- **A06 Payment** — `POST /billing/orders/{order}/pay` returns provider
  `redirect_url` and payment id; browser is redirected back; status polled
  via `GET /billing/payments/{payment}`.
- **A07 Renewal/change** — Create a quote for the desired target plan and
  follow the same flow; immediate upgrades take effect upon settlement (no
  proration), downgrades are scheduled for term end (handled by the
  platform plan-change API exposed to admins today; consumer self-service
  flows through Quote→Order→Pay).
- **A08 Financial history** — `GET /billing/documents`, `GET /billing/documents/{id}`,
  `GET /billing/documents/{id}/render` for invoice/receipt listing and
  RTL rendering payload.
- **A09–A13 Platform admin** — All endpoints under `/api/v1/platform/billing/*`
  and `/api/v1/platform/subscriptions/*` with the documented permission
  gates.

Server-owned fields (never trust the browser): `total_toman`,
`subtotal_toman`, `tax_toman`, `discount_toman`, `doc_number`,
`status/state`, `grace_ends_at`, `correlation_id`, `confirmation_token`.

---

## 10. Outstanding / Deferred Register

| Item | Status | Owner / Blocker |
|------|--------|-----------------|
| Live PSP adapter (real-money gateway) | **Deferred** — sandbox only. `PaymentGateway` interface is stable; provider selection, signing, credentials, and webhook firewall are pending procurement. | Product / Ops |
| Refund endpoint | **Deferred** — no approved policy beyond no-proration-on-immediate-upgrade. Documented invariants in `docs/C5-M6-REFUND-POLICY-REVIEW.md`. | Product policy |
| Automatic paid renewal | **Deferred** — no approved auto-renew policy; manual renewal already supported via Quote→Order→Pay and platform `renew` admin endpoint. | Product policy |
| PDF invoice/receipt rendering | **Deferred** — backend emits RTL-ready render JSON; printable rendering is a Frontend concern (documented). | Frontend |
| Independent security penetration test | **Not performed.** This report marks technical completion, not security acceptance. | Security |
| Laragon / staging acceptance | **Not performed.** Sandbox CI passes on MySQL 8, MariaDB, MariaDB 10.4 legacy. | Ops |
| Product-owner final sign-off | **Pending.** | Product owner |
| Production deployment | **Not authorized.** | Ops |

No other placeholders remain in core financial behavior.

---

## 11. Operational Configuration Inventory

| Variable | Purpose | Default |
|----------|---------|---------|
| `BILLING_GATEWAY` | Payment provider selector (`sandbox` today) | `sandbox` |
| `BILLING_FREE_PERSONAL_PLAN_KEY` / `BILLING_FREE_ORGANIZATION_PLAN_KEY` | Free plan keys | `free-personal` / `free-organization` |
| `BILLING_FREE_PERSONAL_PLAN_VERSION` / `…_ORGANIZATION_PLAN_VERSION` | Free plan version numbers | `1` / `1` |
| `BILLING_QUOTE_TTL_MINUTES` | Quote TTL | `30` |
| `BILLING_ORDER_REVIEW_TTL_DAYS` | Order review window | `7` |
| `BILLING_GRACE_DAYS` | Post-expiration grace (also per-plan overrides) | `7` |
| `BILLING_MAX_AMOUNT_TOMAN` | Upper bound for arithmetic guards | `9_000_000_000_000_000` |
| `APP_KEY` | Laravel app key (session/encryption) | required |
| Queue connection | `sync` acceptable in sandbox; a real provider needs a persistent worker for outbox | `sync` |

Monitoring signals:
- `billing_payment_verification_failures_total` (counter) — non-zero indicates provider or signature problems.
- `billing_reconciliation_findings_open` (gauge) — should return to 0 after
  each sweep + resolution; sustained non-zero means an operator must
  intervene.
- `billing_quotes_expired_total`, `billing_orders_expired_total` — routine
  hygiene counters.
- `billing_outbox_depth` (gauge) — sustained non-zero after a reconciliation
  pass indicates a fulfillment problem.

---

## 12. Acceptance Self-Assessment

| Criterion (from §18 of the finalization brief) | Verdict |
|--------------------------------------------------|---------|
| All approved sales & subscription backend behaviors implemented | ✅ |
| No material gap in plan/catalog/checkout/order/subscription APIs | ✅ (§7) |
| Complete sandbox purchase→fulfillment→document flow passes | ✅ (`test_payment_finalization_issues_invoice_and_receipt` and the full Billing test suite) |
| Promotion, payment, documents obey idempotency + concurrency guarantees | ✅ (unique constraints + mutex tests) |
| Subscription transitions match approved rules (no proration on immediate upgrade, deferred downgrade, 7-day grace, Free fallback) | ✅ (`PlanChangePlanner` + `SubscriptionService` tests) |
| Resource quotas enforced through authoritative contracts | ✅ (`ResourceLimitGuard`, `SubscriptionEntitlementEvaluator`) |
| Reconciliation detects/reports material inconsistencies | ✅ (`FinancialReconciliationService`, finding types documented) |
| No undocumented placeholders in core financial behavior | ✅ |
| All five canonical CI gates green on the final SHA | ✅ (run 43704619376) |
| API/operational documentation matches implemented source | ✅ (this report + `docs/C5-M5-M6-BACKEND-API.md` + `docs/C5-M6-REFUND-POLICY-REVIEW.md`) |
| Deferred functionality explicitly named with reason and owner | ✅ (§10) |
| Report distinguishes technical completion from production readiness | ✅ (this section) |

**C5 COMMERCIAL BACKEND TECHNICALLY COMPLETE.**
Independent security review, live PSP onboarding, Laragon acceptance,
browser/UX acceptance, and product-owner sign-off remain separate gates.
