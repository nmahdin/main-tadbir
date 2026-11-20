# C5-C6-FRONTEND-FINAL-REPORT

**Project:** TADBIR Comprehensive · C5 Stage 3 + C6 shared services operational frontend  
**Repository / branch:** `nmahdin/main-tadbir` · `arena/582a70e5-main-tadbir`  
**Implementation baseline before documentation:** `55eb453de80d1f91fab1b7f35149e09379022e91`  
**Status:** **Frontend implementation delivered and its automated frontend gate green; repository-wide acceptance blocked by concurrent C7 Backend Contracts/Pint failures. Not production-ready.**  
**PR:** #14 remains OPEN/UNMERGED. No force-push, merge or deployment.

## 1. Source reconciliation and preservation

Verified sources: `C5-COMMERCIAL-FINAL-REPORT.md`, `CORE-SHARED-SERVICES-FINAL-REPORT.md`, `docs/C5-M5-M6-BACKEND-API.md`, `frontend/docs/C5_FE_P0_IMPLEMENTATION_MATRIX.md`, current Laravel controller and route definitions, and the operational React 19 / Ocean shell and permission model. Existing C5 visuals and components were retained and expanded; no separate commercial shell or replacement Ocean Studio screens were introduced.

The live backend HTTP/controller contract is authoritative. In particular, the consumer has no separate renewal/upgrade/downgrade mutation API: these operations are represented by quote → order → payment → server fulfillment, not invented direct endpoints. The authoritative financial-document endpoint returns a renderable JSON payload, not a PDF file.

## 2. Implementation commits

| Commit | Scope |
|---|---|
| `75f64d9e` | Typed C5 payment, subscription, document and platform finance API contracts |
| `263d60b8` | Payment/order entry, server-confirmed payment detail/reconciliation, subscription period and printable documents |
| `27252a88` | Platform all-plan inventory, full draft visibility and reconciliation workflow |
| `a766e946` | Typed C6 inbox, notices and support API client |
| `46ef467a` | Environment-aware Action Inbox UI and safe origin navigation |
| `78650db8` | Consumer official messages/read/ack and authorized platform message administration |
| `359e7b15` | Requester/agent support UX, replies, notes, attachments and queue controls |
| `29dd3f2a` | Shared services route dispatch and navigation in the existing three operational shells |
| `b47e7f31` | Existing-contract test alignment and pure safe-link test isolation |
| `5807766e` | Sandbox-only PSP link/initiation guard, explicit opt-in and safe message CTAs |
| `b1d1370f` | Inbox paging and owner-scope unit checks, printable document styles |
| `a3bc8b05` | New-ticket attachments and targeted organization notices, integration tests |
| `55eb453d` | Exact platform support-agent permission guard (queue) |
| Report commit | This handoff report; documentation only |

No backend PHP, migration, database, authentication contract, Ocean global token, site-studio or theme-preview source was edited.

## 3. Operational C5 routes and feature matrix

| Frontend route | Implemented behavior | Verified backend API |
|---|---|---|
| `/billing/subscription` | Existing dashboard/share and quota cards preserved | `GET /core/{personal or organization}/dashboard-summary` |
| `/billing/subscription-details` | Server-authoritative term, billing period, state, grace and limits | `GET /billing/subscription[ /organizations/{org} ]` |
| `/billing/catalog`, `/billing/plan/:versionId` | Existing catalog, independent purchase periods, quote creation | `GET /billing/catalog`; `POST /billing/quotes/personal` or `/organizations/{org}` |
| `/billing/quotes`, `/billing/quotes/:id` | Quote list, server money snapshot, expiry, explicit conversion confirmation | `GET /billing/quotes*`, `GET /billing/quotes/{id}`, `POST /billing/quotes/{id}/convert` |
| `/billing/orders`, `/billing/orders/:id` | Order detail/cancel and opt-in payment initiation | `GET /billing/orders*`, `POST /billing/orders/{id}/pay`, `POST /billing/orders/{id}/cancel` |
| `/billing/payments/:id` | Payment lookup, server verification/reconciliation, pending/failed/paid/fulfilled distinction | `GET /billing/payments/{id}`, `POST /billing/payments/{id}/reconcile` |
| `/billing/documents`, `/billing/documents/:id` | Invoice/receipt history, order filter, server payload details and browser print/PDF | `GET /billing/documents*`, `GET /billing/documents/{id}`, `GET /billing/documents/{id}/render` |
| `/billing/platform` | All-plan inventory (including draft), version period price detail/publication | `GET /platform/billing/plans`, `GET /platform/billing/plans/{key}/prices`, `POST /platform/billing/plan-versions/{id}/publish-prices` |
| `/billing/platform/taxes`, `/billing/platform/promotions` | Existing verified tax/promotion operations preserved | Verified C5-M2 APIs |
| `/billing/platform/findings`, `/billing/platform/findings/:id` | Reconciliation filtering, evidence review, explicit resolution note and sweep | `GET /platform/billing/findings*`, `POST /platform/billing/findings/{id}/resolve`, `POST /platform/billing/reconcile` |

**Money safety:** Integer-Toman totals and immutable tax/discount snapshot always originate from server responses. No browser prorated amount, invented refund, locally fabricated receipt or success based solely on redirect/query parameters. Idempotency headers remain on quote/order/payment creation. Payment state is reread from the server before success is presented; settled but not fulfilled remains distinctly pending fulfillment.

**Sandbox-only payment UX:** Positive-amount payment initiation is disabled by default and requires explicit `VITE_C5_SANDBOX_PAYMENTS=true` opt-in in a controlled **test** environment. An outgoing provider URL is exposed only when the server reports `provider === 'sandbox'` and the URL is HTTPS. That frontend flag does **not** itself configure the backend; the backend sandbox gateway is bound to `APP_ENV=testing`, so a deployment must confirm that contract independently. Zero-payable orders are server-internal and do not require a PSP.

## 4. Operational C6 routes and API integration

| Frontend route | Scope and behavior | Backend contract |
|---|---|---|
| `/shared-services/inbox`, `/shared-services/inbox/:id` | Recipient visibility by current personal/org context, status/overdue filters, paging, unresolved count, detail, safe internal origin links, personal dismissal only | `GET /me/inbox`, `GET /me/inbox/{id}`, `POST /me/inbox/{id}/dismiss` |
| `/shared-services/messages` | Official notices, unread filter, read independent of acknowledgment, explicit per-version ack, pending-ack indicator | `GET /me/messages`, `GET /me/messages/pending-ack`, `POST /me/messages/{id}/read`, `POST /me/messages/{id}/acknowledge` |
| `/shared-services/messages/admin` | Permission-gated draft, version, audience, acknowledgment policy, publish and retire | `GET/POST /platform/messages`, `POST /platform/messages/{id}/publish`, `POST /platform/messages/{id}/retire` |
| `/shared-services/support` | Requester’s own tickets, new tickets, upload, chronological replies and authorized download | `GET/POST /support/tickets`, `GET /support/tickets/{id}`, `POST /support/tickets/{id}/replies`, `GET /support/attachments/{token}` |
| `/shared-services/support/tickets/:id` | Customer or authorized agent details, attachments, staff-only notes/activity, manager actions | Same owner-scoped ticket APIs plus staff mutations |
| `/shared-services/support/queue` | Agent queue and priority filter, self-claim; manager-only reassign and status transition from detail | `GET /platform/support/queue`, `POST /platform/support/tickets/{id}/assign`, `POST /platform/support/tickets/{id}/status` |

**C6 invariants:** Inbox deep links are allowlisted internal SPA paths, not executable action commands. Switching account/environment clears or scopes query cache. Back-end permissions remain decisive; frontend filtering is not an authorization substitute. Official-message Markdown is displayed as text (no injected HTML). Read does not auto-ack; acknowledgment needs a separate explicit user action. A signed/opaque attachment token alone never authorizes download. Internal notes are not rendered for normal requesters. Organization membership alone grants no access to someone else’s support ticket.

## 5. Authorization and scope matrix

| Environment | Visible features | Necessary permission |
|---|---|---|
| Personal workspace | Personal billing, inbox, notices, own platform support | Authenticated owner or server-confirmed eligibility; backend rechecks |
| Organization management | Organization billing, organization actions and applicable notices | `organization.billing.manage` for financial mutations; org action audience still server-scoped |
| Platform management | Plan/pricing/reconciliation and commercial admin | `platform.billing.manage` |
| Platform management | Publish/retire official system messages | `platform.messages.manage` |
| Platform management | Staff support queue and self-claim | `platform.support.agent` |
| Platform management | Reassign and change ticket status | `platform.support.manage` |

No fourth shell. The existing `App.tsx` route dispatch and `Sidebar.tsx` are reused with page-level active states and current environment permission discovery.

## 6. Ocean components, responsive behavior and accessibility

Preserved existing `Button`, `Badge`, `LoadingState`, `EmptyState`, `useQuery`/mutation, shared auth-context, existing C5 cards/forms/tables and the three shell variants. New C6 panels use Ocean primary `#39677C`, 24px primary surface geometry, soft semantic shadow, RTL Persian typography, responsive flex wrapping and visible focus styles. The shared `PageSurface` and production Ocean global tokens were not changed.

Defined keyboard focus and accessible field labels for notices, support, attachments, paging, action dismissal, and high-impact confirmation; responsive tables use scroll containers. Printing uses RTL document payload and browser print CSS, **not** a fictitious server PDF.

**Real browser acceptance remains PENDING:** No running Chromium/Playwright session was available through this repository connector workflow; no new screenshots or measured 1440×900, 834×1112, 390×844 outcomes are asserted. Existing Playwright source definitions must not be conflated with an executed browser run.

### Human visual acceptance checklist (still outstanding)

- [ ] 1440×900 desktop: three shell nav variants, payment/status/documents, inbox/notices and staff queue
- [ ] 834×1112 tablet: collapsed/mobile navigation, RTL hierarchy and forms
- [ ] 390×844 mobile: no page overflow, visible controls, table horizontal scrolling
- [ ] Keyboard focus, modal confirmation, Escape/mobile drawer, assistive labels
- [ ] Authenticated personal/org/platform account-switch, stale cache and 403/404/409 handling
- [ ] Sandbox gateway return, verified fulfillment, failed/processing/expired payment state
- [ ] Print/PDF browser rendering for invoice/receipt from **real server render data**

## 7. Automated verification

Implementation source contract and behavioral unit tests were added for C5 sandbox initiation gating and HTTPS provider URL safety, C6 safe deep links and selected-environment inbox visibility, C6 message read/ack separation, support permissions and staff-only notes, and operational navigation. Existing 327 baseline tests are retained.

Last fully observed frontend gate before this report: [run 44800187616](https://github.com/nmahdin/main-tadbir/actions/runs/44800187616), `a3bc8b05...`: **334 tests passed, 0 failed**, TypeScript, lint and build passed. Follow-up changes are frontend-only permission guard refinements and will be tested by the final-HEAD run. Do not claim browser execution on the basis of CI source tests.

## 8. Material backend/API gaps (not fabricated)

1. **Consumer payment history listing:** Backend currently exposes payment lookup by ID, not `GET /billing/payments` listing. Order-linked payment lookup works when an attempt ID is known; a complete paginated historical payment list requires an authorized backend read API.
2. **Consumer subscription period history, scheduled downgrade and eligibility preview:** Current `GET /billing/subscription*` returns state, dates, billing period, limits; it does not expose complete scheduled plan changes or a consumer preview/mutation contract. Existing quote → order → payment is the approved mutation path; no made-up consumer renew endpoint was introduced.
3. **Provider return UX:** Backend GET callback verifies payment server-side and returns JSON. A dedicated safe browser return-to-SPA UX contract is not provided; UI can resume status by known payment ID, but no invented callback success flag or redirect is trusted.
4. **Platform plan/version CRUD:** `GET /platform/billing/plans` now supplies full inventory including drafts. No authorized HTTP create/edit plan/version endpoint exists; creation controls remain disabled.
5. **Global platform order/payment oversight:** There are no approved platform-wide paginated order/payment history APIs. Existing owner-scoped history and reconciliation findings are not presented as a platform-wide inventory.
6. **Server PDF:** Financial-document API delivers a signed snapshot/render JSON. Browser print-to-PDF is correctly labeled; there is no server-generated PDF claim.
7. **C7 concurrent backend gate:** Backend Contracts currently fails Laravel Pint on `app/Core/Security/Events/SecurityEventWriter.php` and `app/Core/Security/Mfa/CoreMfaFactor.php`. These are concurrent Backend C7 files and were **not changed** under frontend-only authorization.

## 9. Canonical CI and completion status

Canonical five gates run on every pushed shared-branch HEAD. Prior frontend checks are green with 334 tests and a successful build. MariaDB 10.11 and MariaDB 10.4 gates pass in the latest completed implementation runs. The MySQL concurrency job is lengthy and has been cancelled by subsequent frontend push before a final determination in some runs. Backend Contracts remains red on independent C7 Pint findings (above). A final documentation-only commit triggers its own five-gate run; **verify that exact final HEAD before any repository-wide claim**.

**Delivery status: C5 Stage 3 + C6 frontend source implemented and frontend CI green; full-repository CI and human visual acceptance not yet green. This report is a technical handoff, NOT a Production Ready or CORE COMPLETE declaration.**

## 10. Restrictions and stopping boundary

- No backend edits, migrations, real database mutations, live PSP activation, refunds, or arbitrary action-command execution.
- No edits to `/site-studio`, `/theme-previews`, global Ocean tokens, or separate organization Ticketing implementation.
- PR #14 remains OPEN/UNMERGED; no force-push or deployment.
- Preserve concurrent C7 changes and stop after reporting verified evidence and remaining blockers.
