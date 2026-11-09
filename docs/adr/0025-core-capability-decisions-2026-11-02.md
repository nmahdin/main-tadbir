# ADR-0025 — Core Capability Decisions Batch 2026-11-02 (CORE-DEC-02 follow-on: SUB/PAY/BILL/REQ/MSG/SUP/OPS/BACKUP/MAINT/DAM/SEC/UX)

**Status: ACCEPTED (Product Owner, 2026-11-02, transmitted by Chief Software
Architect). Option A chosen for all 15 decisions below.**

This ADR records the product-owner-approved decisions that landed together
on 2026-11-02 after CORE-DEC-01/02 (ADR-0024). It does NOT implement any
of them — implementation remains scheduled under the respective future
stages per ADR-0019 priority and the roadmap. Each decision carries an
explicit "compatibility impact" section describing whether it changes
already-landed M2-S1 behavior or future schemas. No silent implementation
is performed by this ADR.

## Previously approved decisions preserved (not re-decided here)

- CORE-DEC-01/02 (ADR-0024) — core-completion definition and
  verification gates.
- C5-M2 Q1=A — configurable seven-day order-review TTL independent of the
  30-minute configurable quote TTL (see ADR-0023 reconciliation).
- C5-M2 Q2=A — exactly one promotional code per quote; no stacking.
- C5-M2 Q3=A — at most one applicable active tax rule at a time.
- Package-based subscriptions; no monetary daily balance; no prorated
  refund on upgrade.
- Independent monthly, quarterly, and annual plan prices with
  independently enabled purchase periods.
- Immediate paid upgrade; deferred downgrade.
- Manual renewal.
- Seven-day grace period followed by eligible Free conversion with data
  preservation.
- C5-M2 D1…D5=A (see ADR-0023).
- ADR-0020 original + Amendment B + Amendment C (flat content surfaces,
  standalone-card elevation, rounded primary content surfaces / radius
  hierarchy).

---

## Decisions (all option A)

### C5-SUB-09 = A — Renewal billing period selection

**Decision:** A subscriber may select any *available* billing period
(monthly, quarterly, annual — independently enabled per plan) at renewal,
with the new period taking effect *after* the current paid term ends.
Renewal does not shorten or extend the in-flight paid term; it commits the
next term to the selected period at that term's locked price.

**Compatibility impact:** M2-S1 does not yet implement renewal flows; the
landed data model (plan prices keyed by `period` in `core_plan_prices`,
quotes locked to a specific `plan_version_id`+`period`) already supports
this. Future renewal jobs (M3+) MUST use post-term effective dating — no
schema change required at this time, only a renewal-order type that
points at the next term and does not activate until
`current_term_ends_at <= now`.

### C5-SUB-10 = A — Downgrade preserves above-limit data

**Decision:** When an account downgrades to a plan whose quota is lower
than the current usage, existing above-limit data (files, projects,
records, members, etc.) is preserved read-only; no automatic deletion
occurs. Additional allocation (new uploads, new creation above the new
limit) is blocked until usage returns within quota or the account
re-upgrades.

**Compatibility impact:** M2-S1 quotes/prices have no awareness of
downgrade quotas; the entitlement module already enforces feature/quota
gates at activation time. Future downgrade logic (M3 deferred-downgrade
job) must emit a "usage over quota" soft-block rather than a destructive
cleanup; quotas/entitlements schema does not need a new column, but an
`entitlement_state = over_quota_soft_block` flag (or equivalent) will be
introduced at that stage. Existing M2-S1 tests are unaffected.

### C5-PAY-01 = A — Provider-neutral multi-gateway payment adapters

**Decision:** Payment processing is exposed through a Core
`PaymentGateway` contract/interface; multiple PSP adapters (e.g. Zibal,
NextPay, PayPing, Stripe-test) implement the contract; plans/orders do
not reference a specific PSP at the domain level. Selection of gateway
is a runtime/platform-configuration concern, not a hard-coded default.

**Compatibility impact:** M2-S1 explicitly does not implement payment
execution (SPEC-C5-M2 §M2-R4/R5 boundaries). No schema/code change
required now; when payment work starts (M3+), the adapter contract MUST
live in `App\Core\Payments\Contracts` and adapters in
`App\Core\Payments\Adapters\*`, registered through the module manifest.

### C5-PAY-02 = A — Ambiguous payments remain reconcilable; success requires authoritative PSP verification

**Decision:** A payment attempt in an unknown/ambiguous state (timeout,
duplicate callback, mismatched signature, network error after debit) MUST
NOT be auto-refunded or silently marked successful. It remains in a
reconcilable state (e.g. `pending_verification`) until an authoritative
PSP verification call (or signed webhook) confirms the terminal outcome.
No fulfillment (subscription activation) happens on ambiguous evidence.

**Compatibility impact:** M2-S1 has no payment-attempt table; this
decision shapes the `billing_payment_attempts` and reconciliation job
that will land in M3+. No M2-S1 changes needed.

### C5-BILL-01 = A — Durable payment receipt + uniquely numbered immutable invoice

**Decision:** Every successful payment yields (a) a durable, append-only
receipt row capturing the PSP reference, amount, currency, timestamp and
actor context, and (b) a uniquely numbered, immutable financial invoice
record (sequential invoice number, non-reusable across voids) suitable
for bookkeeping. Invoices are never silently edited; corrections are
issued as separate credit-note style entries.

**Compatibility impact:** M2-S1 has no receipt/invoice tables; the
immutability rule mirrors the already-approved M2-S1 immutability of
published prices (`CorePlanPrice` throws on dirty of published amount),
so developers should follow the same pattern. No M2-S1 changes.

### CORE-REQ-01 = A — Shared action-required inbox

**Decision:** Core exposes a unified "action required" inbox per user
(and per organization scoped-role view) aggregating items from domain
modules: pending approvals, overdue tasks, pending invites, payment
issues, signature-required items, verification steps. Items link back
to the originating module via typed references (see ADR-0018
cross-module reference contract). Modules never write directly to the
inbox table; they publish events / register providers.

**Compatibility impact:** Inbox module/surface does not yet exist in
M2-S1; UX-02-4 notification center (already staged) is a related but
distinct channel (informational vs action-required). Future stage will
introduce `core_action_items` or equivalent, scoped by workspace/user
and typed by source module.

### SYS-MSG-01 = A — Versioned mandatory system messages with explicit acknowledgement

**Decision:** Platform operators can publish mandatory system messages
(e.g. TOS updates, maintenance notices, security disclosures) that are
versioned, scoped (platform / organization / user segment), and require
an explicit acknowledgement action with a stored timestamp. A message
may block critical surfaces until acknowledged if configured as
blocking; otherwise it surfaces as a persistent toast/banner until
acked. Acknowledgement is immutable and audited.

**Compatibility impact:** Not present in M2-S1. Affects frontend shell
(integration already prepared under Amendment C surfaces; no CSS
changes now) and adds a future `core_system_messages` /
`core_system_message_acknowledgements` pair of tables. Does not
conflict with any M2-S1 code.

### SUP-01 = A — Central support ticket system

**Decision:** Core supplies a central support-ticket subsystem with
priority, assignment, state transitions (new / awaiting-user /
awaiting-agent / resolved / closed), full history (private/internal
notes vs user-visible replies), and linkage to the originating workspace
/user/entity. Domain modules may attach a ticket to domain records via
cross-module references; they do not roll their own ticketing.

**Compatibility impact:** Not in M2-S1; no conflict.

### OPS-01 = A — Internal incident logging + configurable deduplicated external alerts

**Decision:** Operational incidents (uncaught exceptions, PSP failures,
backup failures, scheduled-job failures, quota anomalies) are logged
internally via a durable incident channel with dedup keys and
configurable external alert routing (email / Bale webhook / etc.) with
rate-limited deduplication. Chatter is suppressed; only state transitions
(firing → resolved) and threshold breaches alert externally.

**Compatibility impact:** Not in M2-S1; existing logging through
Laravel's log stack stays in place and will be bridged into this
subsystem later. No M2-S1 changes.

### BACKUP-01 = A — Scheduled encrypted backups with periodic restore verification

**Decision:** Backups are scheduled automatically, encrypted at rest
with a separate backup key, and periodically restored into a disposable
verification environment to prove recoverability. Backup policy, key
rotation, and verification cadence are platform-configurable. Failed
verifications page operators via OPS-01.

**Compatibility impact:** Deployment/operations concern; no application
schema changes in M2-S1. Operators must supply the backup key through
environment/secrets; no key is committed.

### MAINT-01 = A — Controlled scheduled maintenance mode with authorized-administrator access

**Decision:** Maintenance mode is operator-scheduled (start/end window,
reason, affected surfaces), emits SYS-MSG-01 notice to affected users
ahead of time, and during the window only explicitly-authorized
administrators (platform ops role) can traverse the affected surfaces
while regular users see a maintenance page. Switchover/switchback is
audited.

**Compatibility impact:** Laravel's `php artisan down` is a blunt tool;
future implementation introduces scoped maintenance (by surface/module)
rather than global 503. No M2-S1 changes.

### DAM-DEC-01 = A — Attribute new assets to actual core workspaces; no fabricated legacy ownership

**Decision:** New DAM assets uploaded after cutover are always attributed
to the actual core workspace / actor / domain reference that uploaded
them. When migrating or backfilling legacy assets whose true owner
cannot be proven, assets are attributed to an explicit "unattributed"
bucket and marked for human review; the system never fabricates a
legacy owner workspace/department/user to satisfy an FK.

**Compatibility impact:** The DAM module already shipped during C5-C3
with workspace scoping; this decision confirms the policy and forbids
future backfill scripts from inventing ownership. Existing M2-S1 code
does not introduce a backfill path; future legacy-import scripts must
respect the "unattributed" bucket.

### SEC-DEC-01 = A — Mandatory MFA for sensitive administrative roles; optional for other users

**Decision:** Multi-factor authentication is mandatory for users holding
sensitive administrative roles (platform admin, organization billing
manager, workspace owner at production release — exact TBD list set by
platform security config), and optional (encouraged) for other users.
MFA enrollment is a release-readiness gate for the sensitive-role
accounts before production deployment.

**Compatibility impact:** Identity module (AUTH-EXT-01) already supports
device trust (see `Core\Identity\Devices\DeviceTrust`); TOTP/WebAuthn MFA
enrollment is a future addition that plugs into device trust. No M2-S1
schema conflict.

### UX-CORE-01 = A — Context-specific resumable onboarding

**Decision:** Onboarding is context-specific (personal account vs
organization admin vs platform admin) and resumable: progress is
persisted per-context, steps are skipped when preconditions are already
satisfied, and the user returns to the last incomplete step on next
login. Onboarding never blocks critical sign-in/security flows, but may
gate entry to surfaces whose prerequisites are not satisfied.

**Compatibility impact:** Onboarding surface is a future frontend shell
addition under UX-02-4 / Amendment C shell. No CSS/React changes made by
this ADR; future implementation must respect the Amendment C radius
hierarchy (ADR-0020 Amendment C) and the existing flat/elevated
classification.

---

## C5-M2 compatibility notes (already-landed M2-S1)

- **Quarterly pricing:** The product owner approved independent monthly,
  quarterly, annual plan prices with independently enabled purchase
  periods. M2-S1 `CorePlanPrice::PERIODS` currently contains only
  `monthly` and `annual`. Adding `quarterly` is a future schema+code
  change (new constant, new period value, new seeder/admin entry,
  quote/order coverage); it is NOT performed by this ADR. Tracked as a
  required M2 extension before quarterly plans can be sold.
- **Subscription lifecycle:** M2-S1 does not yet implement the full
  subscription lifecycle (renewal, deferred downgrade, seven-day grace
  → Free conversion). Existing `core_subscriptions.status` field must
  grow to accommodate `past_due`/`grace`/`expired`/`cancelled` states
  per ADR-0013 (still pending human acceptance of that ADR's full
  table). Until then M2-S1 retains the `pending → active` initial
  purchase flow only.
- **No promo stacking, single tax rule, seven-day order-review TTL:**
  already aligned with M2-S1 provisional defaults; the provisional
  marker is now removed from those three dimensions (see ADR-0023
  reconciliation).

## Out-of-scope / not implemented

- No payment, invoice, MFA, backup, messaging, onboarding, support,
  incident-alert, or maintenance-mode implementation is introduced by
  this ADR.
- No React/CSS/token/surface changes.
- No migrations, no schema changes, no permission catalog changes.
- No C5-M3, M4, M5, M6 work is brought forward.
- Q4 (upgrade credit/proration) and Q5 (catalog visibility of
  unpublished-period plans) remain OPEN pending explicit product-owner
  approval.
- Human acceptance deferral noted in ADR-0024 remains in force; this
  ADR records product-owner approval of the decisions, not final human
  acceptance of their implementation.
