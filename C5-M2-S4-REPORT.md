# C5-M2-S4 — Order Review and Safe Quote-to-Order Conversion

**Final report.** Branch: `arena/582a70e5-main-tadbir`. PR: #14 (`docs(stage-01): Architecture contracts, ADRs and revised refactoring roadmap`). Final tip: `2847c76c` (run 42473689810, all five canonical gates ✓).

## 1. Heads and commit inventory (logical, excluding ephemeral diag commits)

| Commit | Subject | Purpose |
|---|---|---|
| `cf598c85` | `feat(c5-m2-s4): order review + safe quote-to-order conversion` | Schema, models, services, controller, command, routes, full test suite |
| `6a9b5164` | `fix(c5-m2-s4): prune unused imports for pint` | PSR-12/pint compliance |
| `7362dfb4` | `fix(c5-m2-s4): constructor brace style` | PSR-12/pint compliance |
| `f53bcb1a` | `fix(c5-m2-s4): skip order_id FK on sqlite (ALTER TABLE FK unsupported)` | SQLite portability for the ALTER TABLE add-FK on promo_reservations (gated to mysql/mariadb, matching the S3 owner-FK precedent) |
| `bf9ff58a` | `fix(c5-m2-s4): address phpunit failures (header idempotency, lazy expiry durability, per-period supersede); add quote->order HasOne` | (a) Fixes the `Idempotency-Key` header path (validator `required_without:` cannot read HTTP headers; manual precedence header → lower-case header → body). (b) Pulls lazy quote-expiry out of the main conversion transaction so the `EXPIRED` update and reservation release commit durably before we throw `quote_expired`. (c) Makes supersession per-`(owner, plan_version, period)` so monthly/quarterly/annual quotes for the same plan don't cancel each other. (d) Adds the missing `CoreBillingQuote::order(): HasOne` relation. |
| `2847c76c` | `fix(c5-m2-s4): per-period supersede (do not supersede cross-period quotes); align S3 supersession test` | Updates `BillingQuoteTest::test_new_quote_supersedes_prior_open_quote_and_releases_reservation` to assert the new per-period rule (cross-period OPEN quotes coexist; same-period quotes supersede). |

The ~50 `ci(diag):` and two `chore: remove ephemeral diag workflow` commits are CI diagnostics and are all removed from the working tree (tip contains no `diag.yml`; no ephemeral code remains).

## 2. Migrations

One additive migration (MariaDB 10.4 / MySQL 8 / SQLite safe):

`backend/database/migrations/2026_11_08_000001_c5_m2_s4_order_review.php`

- **`core_billing_orders`** (columns): `id`, `quote_id` (unique FK, restrict), `owner_key` (string, matches core_subscriptions), `organization_id` / `personal_workspace_id` (restrict FKs; exactly one non-NULL enforced at app layer, CHECK gated to mysql/mariadb), `period` (monthly|quarterly|annual), `subtotal_toman`/`discount_toman`/`tax_toman`/`total_toman` (signed **BIGINT** Toman), `promo_id` (nullable restrict), `promo_code_snapshot`, `tax_rule_id` (nullable restrict), `tax_rate_basis_points`, `status` (in_review|cancelled|review_expired), `review_expires_at` (dateTime), `cancelled_at`/`expired_at`, `idempotency_key`, `payload_hash`, `created_by_user_id` (restrict), `cancelled_by_user_id` (nullOnDelete), timestamps.
- **`core_billing_order_lines`** (columns): `id`, `order_id` (cascade), `kind` (plan|discount|tax), `description`, `amount_toman` (signed BIGINT, discount lines negative), `price_id` (nullable restrict), `tax_rate_basis_points`, `created_at`.
- **`core_billing_promo_reservations.order_id`** (nullable unsigned bigint, indexed; FK to billing_orders nullOnDelete gated to mysql/mariadb — SQLite `ALTER TABLE ADD FOREIGN KEY` is not supported by Laravel's portable grammar, so the FK is skipped there, consistent with `2026_11_07_000004_c5_m2_s3_owner_fk_restrict.php`).
- Indexes: `billing_orders_quote_uniq` (unique on `quote_id`), `billing_orders_owner_idem_uniq` (unique on `(owner_key, idempotency_key)`), `billing_orders_owner_status_idx`, `billing_orders_status_expires_idx`, org/ws indexes; `billing_order_lines_order_idx`; `billing_reservations_order_idx`.
- CHECK constraints (MySQL/MariaDB only): `billing_orders_status_valid`, `billing_orders_amounts_nonneg` (non-negative + discount ≤ subtotal + total ≥ subtotal−discount), `billing_orders_period_valid`, `billing_order_lines_kind_valid`.
- No destructive changes; no data migrations; `down()` correctly reverses column additions in dependency order.

## 3. Code/API inventory

**Models** (all under `backend/app/Core/Billing/`):
- `CoreBillingOrder` — $table=`core_billing_orders`; casts for date/timestamps and cents-as-int; relations: `quote()`, `lines()`, `organization()`, `personalWorkspace()`, `promo()`, `taxRule()`, `createdBy()`, `cancelledBy()`; STATUS_OPEN/IN_REVIEW constant name maps to `'in_review'`, plus `STATUS_CANCELLED`, `STATUS_REVIEW_EXPIRED`; helpers `isOpen()`, `isCancelled()`, `isExpired()`, `isReviewExpiredAt()`, `owner()`.
- `CoreBillingOrderLine` — KIND_PLAN/KIND_DISCOUNT/KIND_TAX constants; `order()` BelongsTo (cascade); amounts signed-BIGINT with discount-line negative assertion in CHECK.
- `CoreBillingQuote` — added `order(): HasOne` (at-most-one, unique FK).
- `CorePromoReservation` — added `order(): BelongsTo` nullable; reservation transfers from quote to order without state flip.

**Services**:
- `OrderService::convert(User, SubscriptionOwner, CoreBillingQuote, string $idempotencyKey, ?CarbonImmutable $at = null): array{order, is_replay}` — atomic conversion (see §5–§6).
- `OrderService::findForOwner(int, SubscriptionOwner): ?CoreBillingOrder`, `listForOwner(...)`, `cancel(...)`, `lazyReviewExpireIfNeeded(...)`, `expireQuoteLocked(...)` (idempotent, state-guarded UPDATE), `expireReservationsForOrderLocked(...)`.
- `OrderService::assertValidIdempotencyKey`, `assertIdempotentPayloadMatches` (key+payload-hash mismatch → 422).
- `QuoteService` — `supersedeOpenQuotesForOwnerVersion()` now scoped to `period` so independent periods don't supersede each other; the old cross-period supersession test was updated accordingly.

**Console command**: `backend/app/Console/Commands/ExpireBillingOrders.php` — scheduled sweeper (registered in `Console/Kernel` at 15min past the hour) atomically marks `in_review` orders past `review_expires_at` as `review_expired` and releases their promo reservations exactly once via a state-guarded UPDATE.

**HTTP API** (`backend/app/Http/Controllers/Api/V1/BillingOrderController.php`, routes in `backend/routes/api.php` lines 391–395, all under `auth:sanctum`):

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/billing/quotes/{quote}/convert` | owner (personal-owner or member with `organization.billing.manage`) | Idempotent via `Idempotency-Key` header or `idempotency_key` body. Returns 201 on first, 200 on replay. 409 on expired/superseded/already-converted, 422 on invalid idempotency/payload-mismatch/ownership. 404 cross-tenant (not 403). |
| GET | `/api/v1/billing/orders` | personal owner, own workspaces | Lists personal in_review/cancelled/review_expired orders. |
| GET | `/api/v1/billing/orders/organizations/{organization}` | member with `organization.billing.manage` | 404 if membership absent. |
| GET | `/api/v1/billing/orders/{order}` | owner (personal or org with permission) | 404 cross-owner. |
| POST | `/api/v1/billing/orders/{order}/cancel` | owner (same permission as convert) | Only `in_review` orders may be cancelled; releases promo reservation exactly once; records `cancelled_by_user_id`/`cancelled_at`. 409 if already cancelled/expired. |

The controller uses `resolveQuoteOwner`/`resolveOrderOwner` which rely on route-model binding with an ownership filter → cross-tenant access returns 404, not 403.

S4 is **review-only**: serialized order responses always emit `payment_initiated: false`; the `payable_pending`/`paid`/`payment_failed` columns/states are **declared but not activated** (activation deferred to M3).

## 4. Order lifecycle state diagram

```
                            +------------------+
    POST quotes/{q}/convert |                  |  POST orders/{o}/cancel
   -----------------------> |    in_review     | ----------------------.
   (atomically: quote OPEN, |   (7-day TTL,    |                       |
    not superseded,          |  promo res       |                       v
    not expired-at-boundary, |  transferred)   |               +-------------+
    snapshot totals,          |                 |               |  cancelled  |
    quote->CONVERTED)         +-------+---------+               +-------------+
                                      |
                                      | (TTL expiry,
                                      |  sweeper or lazy)
                                      v
                               +----------------+
                               | review_expired |
                               +----------------+

Terminal (non-reactivatable): cancelled, review_expired.
Future (M3, declared but gated): payable_pending, paid, payment_failed, refunded.
```

- Cancelling or expiring an order atomically releases the held promo reservation (`reservation.state=released/expired`, `released_at` set) exactly once via a `where state=RESERVED` guard.
- Quote lifecycle `OPEN → CONVERTED` is terminal on the quote row; conversion never increments `promotions.redemptions` (redemption is an M3 payment-activation event).

## 5. Lock sequence and conversion algorithm

The conversion algorithm is a two-then-one transaction:

1. **Pre-lock transaction** (lock order: `core_billing_quotes FOR UPDATE`):
   - Locks the quote FOR UPDATE and:
     - Returns `already` if a sibling order exists (fast-path replay).
     - Returns `reject=superseded` if status is SUPERSEDED (quote supersession is committed durably).
     - Returns `reject=expired` if status is EXPIRED.
     - If `!$quote->isConvertibleAt($at)` (strictly-before boundary, i.e. at exact `expires_at` the boundary is closed), **lazily expires the quote** — flips `status=EXPIRED` and releases its promo reservation inside this transaction, commits and THEN throws `quote_expired`. This fixes the earlier bug where expiry was rolled back by the exception raised in the same transaction.
2. **Main write transaction** (lock order: `core_billing_quotes FOR UPDATE` → create `core_billing_orders` row and insert `core_billing_order_lines` → create/transfer `core_promo_reservations.order_id` → set quote `status=CONVERTED` → write audit `billing.order.created`):
   - Re-verifies post-lock state (OPEN + convertible) — a competing pre-lock expiry/supersession cannot race in.
   - Re-checks for an existing order under the locked quote (covers concurrent converts).
   - Freezes totals from the quote (subtotal/discount/tax/total, promo code snapshot, tax rate snapshot); catalog/promo/tax mutations after conversion cannot change order totals.
   - Creates order rows, creates immutable order lines (plan/discount/tax), updates the reservation `order_id` to transfer the slot (no free/reserve flip-flop, no redemption count bump), marks the quote CONVERTED, audits.

Shared lock order (consistent with S3 sweeper/supersession): **quotes first, then orders/reservations; no cross-table deadlocks against quote-creation or order-expiry paths**.

## 6. Promo handoff contract (Quote → Order → release)

- Quote creation holds capacity in `core_billing_promo_reservations` as `state=reserved`. A reservation is **not** a redemption: `promotions.redeemed_count` stays at zero.
- Conversion **transfers** the existing reservation by setting `order_id` (single atomic UPDATE); no new reservation is inserted and none is released; the quote row moves `open→converted` but redemption count is still untouched.
- **Cancel**: single `UPDATE ... WHERE state=reserved AND order_id=?` → `state=released`, `released_at=now` (state-guarded → at-most-once release).
- **Review expiry** (sweeper and lazy path): same state-guarded UPDATE → `state=expired`, `expired_at=now`.
- **M3 (future)**: payment success atomically flips reservation `reserved→redeemed` and increments `promotions.redeemed_count` exactly once; payment failure behaves like cancel (releases). S4 never touches `redeemed_count`.

## 7. Tests

`backend/tests/Feature/Core/BillingOrderTest.php` is new and covers:

- monthly conversion (line shapes, totals, snapshot immutability against catalog/tax/promo mutations after creation)
- quarterly and annual conversion independently (exercises per-period supersession)
- promo + tax snapshot freezing on the order lines
- strict-boundary rejection at exact `expires_at` and durable quote expiry
- repeated conversion idempotency (same key → same order, is_replay=true; different key on same quote → existing order; payload-hash mismatch → 422)
- owner-delete RESTRICT
- cross-tenant 404 (not 403) and unauthorized-org
- 7-day TTL from `billing.provisional.order_review_ttl_days` (configurable, default 7)
- S4 payment_initiated always false via HTTP response
- cancellation releases reservation, cannot double-cancel, cannot cancel expired
- review_expired releases reservation (sweeper)
- promo retention through conversion and release exactly once at cancel/expiry

Existing S3 regression `BillingQuoteTest::test_new_quote_supersedes_prior_open_quote_and_releases_reservation` was updated to reflect the per-period supersession rule (cross-period OPEN quotes coexist; same-period quotes supersede). All C5-M1 and C5-M2-S3 tests continue to pass.

## 8. CI evidence — five canonical gates (final push `2847c76c`, run 42473689810)

| Gate | Job | Result |
|---|---|---|
| 1 | Backend contracts and tests (PHPUnit + Pint + Migrate on SQLite) | ✓ 2m+ |
| 2 | Frontend typecheck, tests and artifact | ✓ 32s |
| 3 | Backend migration gate on MySQL 8 (+ MySQL concurrency Stage 03B) | ✓ |
| 4 | Backend migration gate on MariaDB (+ engine/CHECK tests) | ✓ 38s |
| 5 | Backend migration gate on MariaDB 10.4 (legacy `explicit_defaults_for_timestamp=OFF` + strict `NO_ZERO_DATE`) | ✓ |

All five green. Ephemeral `diag.yml` removed; no diagnostic workflow remains in-tree.

Non-canonical check `GitGuardian` is pre-existing and not part of the five required gates.

## 9. Outstanding M3 dependencies (declared, not activated in S4)

- PSP integration / payment collection / client tokens / webhook handlers.
- Subscription activation on successful payment (first invoice, start anchor, service provisioning).
- `payable_pending` / `paid` / `payment_failed` order states (columns/timestamps reserved for M3; transitions not wired).
- Final promo redemption (`reservations.state=redeemed`, `promotions.redeemed_count += 1`) — gated to payment success.
- Upgrades/downgrades, renewals, invoicing, refunds, and any operator/admin UI for orders (front-end changes remain out of scope per the standing exclusions).

## 10. Exclusions honoured

No PSP integration, payment collection, subscription activation, upgrade/downgrade/renewal/invoicing/refund logic, frontend changes, destructive migrations, operator data changes, force-pushes, PR merges, or production deploys were performed.

---

Local verification note: this sandbox does not have a PHP binary available and `apt-get` is blocked, so all test evidence is from the GitHub Actions five-gate run referenced above.
