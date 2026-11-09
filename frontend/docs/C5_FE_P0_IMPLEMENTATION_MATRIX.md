# C5 P0 implementation matrix — Stage 0

Verified against actual remote HEAD `2847c76c72dc112c7fe223ce0e311a6920b6cf50`. Reference: user-uploaded `TADBIR_C5_P0_VISUAL_PACKAGE(2).zip`, containing standalone HTML, API handoff and 23 PNG reference screenshots. These PNGs are **not** captures of the application.

| UX | Baseline | Change | Real contract / exclusion |
|---|---|---|---|
| A01 | Existing personal/organization summary cards | Adapt resource and subscription page | GET core/personal/dashboard-summary; GET core/organizations/{id}/dashboard-summary; states and nullable usage only; purchase period not supplied |
| A02/A03 | No real catalog UI | New in operational billing section | GET billing/catalog, published prices separately nullable per monthly/quarterly/annual; personal/org audience; no derived price |
| A04 | No quote review UI | New | POST personal/org quote; GET owner-scoped quote; 403/404/409/422; authoritative monetary snapshot |
| A05 | No order review UI | New | POST quote convert, GET owner-scoped order, GET owner lists, POST cancel; payment_initiated=false |
| A09/A10 | No price administration UI | New | GET platform/billing/plans/{key}/prices; POST publish-prices; platform.billing.manage; version CRUD **not verified** |
| Promotions/tax | No commercial screens | New platform admin | GET/POST promotion and tax; activate/deactivate tax; deactivate promotion |
| Payment/lifecycle | Unavailable M3/M4 | **Blocked** | No PSP, no consumer renewal, no paid upgrade/downgrade, no payment redirect status inference |

**Owner isolation:** Personal endpoint uses server-owned default workspace. Organization actions only in selected active management environment with organization.billing.manage. Platform administration only with platform.billing.manage. UI gating never replaces server checks. Cross-owner 404 must not reveal ownership.

**Financial safety:** Only server-returned prices, Quote and Order totals. Idempotency-Key header and idempotency_key JSON body. No client-authoritative subtotal, tax, promo or total. Quote and order countdown use server remaining fields; no inferred expiration extension.

**Ocean visual contract:** primary #39677C, hover #2B5266, page #F5F9FA, main 24px, standalone 20px and shadow 0 1px 3px rgb(15 23 42 / .035), nested flat 16px, controls 12px. Do not alter global tokens.

**Browser/manual acceptance:** pending until rendered checks. No Backend file changes.
