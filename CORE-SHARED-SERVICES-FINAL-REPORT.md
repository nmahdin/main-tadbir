# CORE-SHARED-SERVICES-FINAL-REPORT

**Project:** TADBIR Comprehensive — C6-CORE (CORE-REQ, SYS-MSG, SUP)  
**Branch:** `arena/582a70e5-main-tadbir`  
**Implementation verification baseline:** `eb976cab703568564ebdef44c8138caec7b368ad`  
**Baseline canonical run:** [44748129211](https://github.com/nmahdin/main-tadbir/actions/runs/44748129211) — all five gates green  
**Final report commit:** Documentation-only successor; verify all five gates on its own HEAD before declaring the delivery accepted.  
**Pull request:** #14 stays OPEN/UNMERGED. No deployment, force-push or frontend-source changes.

## 1. Delivered scope

- **CORE-REQ:** Server-maintained, tenant-scoped action inbox with idempotent publisher reconciliation, origin-based resolution, urgency/due-date and overdue sweep, safe deep links and user dismissal. The inbox **does not** execute origin-module business commands.
- **SYS-MSG:** Versioned, immutable-after-publication system notices, scoped delivery, independent read and acknowledgment, durable per-version acknowledgment hash, fresh delivery provisioning for both inbox and pending-ack API.
- **SUP:** Ticket creation, requester-only ownership, platform support-agent queue, agent self-claim, manager-only reassignment/status operations, replies, internal notes, activity log, private attachment access and safe ticket status transitions.

## 2. Root-cause analysis and fixes

Original canonical run [44731629092](https://github.com/nmahdin/main-tadbir/actions/runs/44731629092) at `65d17ae7b41e591531f42cabaf2e179b5bd5818f` failed:
1. **MySQL 8.0 / MariaDB 10.11 C6 migration:** `action_items_recipient_scope_check` rejected because CHECK columns also participated in `ON DELETE SET NULL` foreign-key actions (MySQL 3823; MariaDB 1901). Both recipient FKs now use **RESTRICT**, retaining the exclusive-recipient CHECK and protecting inbox audit linkage against orphaned parent deletion.
2. **Idempotent inbox uniqueness:** A composite UNIQUE index including both nullable recipient columns did not protect against duplicate origin+recipient rows because SQL UNIQUE indexes treat NULL values as distinct. It is replaced by two scoped unique indexes: `action_items_origin_user_uniq` and `action_items_origin_org_uniq`.
3. **Pint:** 12 backend-core Laravel formatting violations were corrected using an exact formatter-produced patch, without modifying lint policy. The temporary formatter-diagnostic workflow was removed.
4. **SYS-MSG:** Direct pending acknowledgment lookup did not provision newly published eligible message versions. The shared eligible-delivery provisioning routine now runs before both inbox and pending-ack queries.
5. **SUP:** Platform support agents could browse the queue but received 403 when claiming an unassigned ticket. A narrowly scoped agent **self-claim** is now permitted; assigning someone else, unassigning, or taking over an assigned ticket still requires `platform.support.manage`.
6. **Permission regression tests:** Three existing tests still expected eleven pre-C6 platform permissions. They now require the **exact 14-key approved catalog** and explicit provisioning (including `platform.messages.manage`, `platform.support.manage`, `platform.support.agent`); permission and no-automatic-assignment assertions remain enforced.

## 3. Commit inventory

| Commit | Purpose |
|---|---|
| `6333ed0cae64ae1e7078366cf706da09c1e40e86` | Original C6 CORE-REQ / SYS-MSG / SUP implementation |
| `47ea14d9`, `ae61c30d`, `fb67d1c5`, `9867462e`, `9f5ccb19`, `bda0125a`, `65d17ae7` | Existing stabilization attempts before finalization |
| `37eeed74ef5aef84e489c9c8c41cb76ede810467` | Compatible recipient FKs and schema engine regression test |
| `2b27e901e89a40d547e7d4b8dbfe761cf4693a8d` | Pint correctness; diagnostic-only workflow removed |
| `eb976cab703568564ebdef44c8138caec7b368ad` | Acknowledgment, support self-claim, unique indexes, exact permission tests, engine-gate inclusion |
| Final report commit | This document; no application logic change |

## 4. Schema inventory and engine contracts

Migration: `backend/database/migrations/2026_11_15_000001_core_shared_inbox_messaging_support.php`.

| Table | Contract |
|---|---|
| `core_action_items` | Origin module/type/id, action kind, recipient user XOR organization, assignment, urgency/due date, resolved state, allowlisted display actions, indexes and per-recipient origin uniqueness |
| `core_system_messages` | Unique slug/version, audience and optional organization, immutable published content, acknowledgment policy and publication state |
| `core_system_message_deliveries` | Unique (message,version,user), separate `read_at` and `acknowledged_at`, evidence hash and delivery timestamp |
| `core_support_tickets` | Unique reference, requester, optional agent/organization, priority, lifecycle, timestamps and queue indexes |
| `core_support_messages` | Ticket, author, requester/agent/system role, public vs internal-note flag, attachment metadata |
| `core_support_attachments` | Ticket, uploader, storage path, MIME, size, opaque token and access timestamp |
| `core_support_activity` | Append-only ticket event, actor, JSON payload and created timestamp |

CHECK constraints enforce valid action kinds, urgency, ticket states/priorities, support-message author roles, and exactly one inbox recipient on supported MySQL/MariaDB engines. Foreign keys and application validation complement these checks. **No destructive database operation was executed against production.** Canonical migration gates use isolated clean CI databases.

## 5. C6 API contracts

All paths below are relative to `/api/v1`, and are subject to the existing authenticated/active-account route middleware.

**Personal action inbox (CORE-REQ)**

| Method | Path | Meaning |
|---|---|---|
| GET | `/me/inbox` | Filtered user/org-visible action list |
| GET | `/me/inbox/{item}` | Authorized item detail |
| POST | `/me/inbox/{item}/dismiss` | Resolve display item locally; never execute business action |

**System messages (SYS-MSG)**

| Method | Path | Meaning |
|---|---|---|
| GET | `/me/messages` | Eligible, delivered notices |
| GET | `/me/messages/pending-ack` | Pending mandatory acknowledgments, provisioning current eligible versions |
| POST | `/me/messages/{delivery}/read` | Mark read **without** acknowledging |
| POST | `/me/messages/{delivery}/acknowledge` | Idempotent version-specific acknowledgment |
| GET | `/platform/messages` | Platform notice administration |
| POST | `/platform/messages` | Create a versioned notice/draft |
| POST | `/platform/messages/{systemMessage}/publish` | Publish |
| POST | `/platform/messages/{systemMessage}/retire` | Retire |
| GET | `/platform/messages/{systemMessage}/deliveries` | Restricted delivery reporting |

**Support (SUP)**

| Method | Path | Meaning |
|---|---|---|
| GET/POST | `/support/tickets` | Own-ticket list and create |
| GET | `/support/tickets/{supportTicket}` | Ticket detail: requester-visible replies, no internal notes |
| POST | `/support/tickets/{supportTicket}/replies` | Authorized reply/agent note |
| GET | `/support/attachments/{token}` | Authorized owner/agent download, token alone insufficient |
| GET | `/platform/support/queue` | Platform staff queue |
| POST | `/platform/support/tickets/{supportTicket}/assign` | Agent self-claim, manager other-assignment/reassignment |
| POST | `/platform/support/tickets/{supportTicket}/status` | Manager-authorized state transition |

## 6. Authorization and isolation

- CORE-REQ personal entries are recipient-owned; organization entries require active organization membership; arbitrary origin commands are not exposed by inbox endpoints.
- SYS-MSG eligibility is restricted by audience and membership. Delivery read/ack endpoints return **404 for another user's delivery**. Message versions retain their own immutable acknowledgment evidence.
- SUP requesters see their **own tickets only**, even if another requester shares an organization. Agent authority is a separately assigned platform permission, not inferred from org membership. Internal notes/activity are not disclosed to requesters; attachment downloads recheck ticket authorization.
- Platform message administration uses `platform.messages.manage`; platform support self-claim/queue uses `platform.support.agent`; reassignment and status transitions require `platform.support.manage`. The primary administrator permission expansion is explicit, not silently granted by catalog synchronization.

## 7. Test evidence (implementation baseline)

Run [44748129211](https://github.com/nmahdin/main-tadbir/actions/runs/44748129211) completed with **five PASS gates at identical code SHA `eb976cab...`**:

| Canonical gate | Outcome | Evidence |
|---|---|---|
| Backend contracts and PHPUnit | PASS | Pint green; 1,029 PHPUnit tests, 19,478 assertions; 62 skipped |
| MySQL 8 migration and concurrency | PASS | 59 tests, 279 assertions |
| MariaDB 10.11 migration and schema | PASS | 20 tests, 128 assertions |
| MariaDB 10.4 legacy timestamp mode | PASS | 8 tests, 60 assertions |
| Frontend lint/typecheck/tests/build | PASS | 327 tests, 0 failed; build success |

`CoreSharedInboxMessagingSupportTest` covers origin idempotency, inbox isolation, overdue sweep, versioned message read/ack behavior, user isolation, ticket lifecycle, private attachments and support roles. `CoreSharedRecipientSchemaMysqlTest` is explicitly included in engine workflows to test true database CHECK/FK/UNIQUE behavior and is skipped under SQLite by design. SQLite-specific skips are not evidence that engine tests are absent.

## 8. Frontend handoff — no frontend source changed

Recommended independent frontend epic should consume existing API contracts, not infer missing capabilities.

- Add a personal **Action Inbox** separate from notifications: actions expose only server-provided display links/dismiss; no browser execution of origin business commands.
- Add **Official Messages** with separate read and acknowledgment indicators, version-specific mandatory-ack UI and safe, server-provided local CTA links.
- Add **Support** owner views and a permission-gated platform queue. Requesters must never see internal notes, activity logs or other users' tickets; support agents must not gain manager reassignment UI.
- Use existing React/Ocean RTL controls, app shells and API client. Distinguish loading/empty/403/404/conflict/error states. Treat the server as source of eligibility, authentication, permissions and tenant ownership.
- Signed/opaque attachment tokens do **not** grant permission on their own. No feature should be advertised as deployed until separate frontend authorization, browser verification and owner acceptance.

## 9. Delivery boundary

No Frontend, production deployment, PR merge, force-push, or destructive production database operation. This report completes **C6 technical backend delivery** only once the documentation-only final HEAD also finishes all five canonical CI gates; do not start another core epic.
