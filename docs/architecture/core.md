# TADBIR Comprehensive — Core Architecture (Reconciled, Stage 01)

- **Status:** PROPOSED — awaiting explicit human approval of this Stage 01 PR. Nothing in this document is implemented.
- **Stage:** 01 (architecture contracts only). No code, schema, config, UI, or data changes.
- **Audited baseline:** `main` @ `b30bfefdeb4550fa971e76006c42af143c19e745`; Stage 00 report: `docs/migration/00-current-state-audit.md`.
- **Sources reconciled:**
  1. Draft `docs/architecture/core.md` from unmerged draft PR #13 (`docs/core-architecture-migration`, head `ef5ded4…`) — read read-only, **not merged, not approved by that fact alone**.
  2. Draft `docs/roadmap/migration-to-tadbir-comprehensive.md` from the same PR.
  3. The approved platform rules in the TADBIR Comprehensive Agent Migration Playbook (§0, rules 1–16).
  4. The user's revised strategy clarification (2026-10-15): TADBIR is a development-stage system with **no important production data to preserve**; controlled architectural refactoring replaces legacy-data-preserving migration.
  5. Observed repository facts (Stage 00). Where a draft statement contradicted observed code or the revised strategy, the contradiction is recorded in §12 and in the relevant ADR — never silently overwritten.

> Reading convention: **CONFIRMED** = observed fact at the audited commit. **PROPOSED** = recommendation in this document, becomes binding only on explicit approval. **OPEN** = undecided; no stage may invent an answer while implementing.

---

## 1. Architectural style

**Decision frame (PROPOSED, ADR-0001):** One Laravel deployment as a **modular monolith** (`backend/`, Laravel ^13.17 / PHP ^8.3) plus the separately maintained React 19 + TypeScript + Tailwind SPA (`frontend/`). No microservices, no new infrastructure packages by default. Modules own their code and tables; cross-module interaction only through documented in-process contracts (service interfaces / domain events), never direct writes into another module's tables.

Current state (CONFIRMED): a flat `App\` namespace (Controllers / Services / Bot), 35 Eloquent models, a complete second access surface in `app/Bot/Bale/**`, and services that freely read/write across today's informal module boundaries. Module boundaries are therefore a *target*, introduced incrementally (Stage 02 skeleton, then module-by-module), not a big-bang relocation.

## 2. Target Core domain model (conceptual — not a migration specification)

| Entity (table name proposed) | Owner/scope | Key invariants |
|---|---|---|
| `users` (existing, retained) | Platform identity | One human = one account; no per-organization logins. Account status (`active/inactive/blocked/pending`) is platform-level. Identity alone grants **no** workspace access |
| `organizations` (new) | Platform/Core | Owns org billing, org settings, org workspaces. Creating an organization atomically creates exactly one default organization workspace + initial admin membership (Stage 03) |
| `organization_memberships` (new) | Core | Independent of workspace membership. Status semantics: PROPOSED `active / deactivated / ended` (exact enum **OPEN**, register Q-05). Deactivation blocks access to all of that org's workspaces immediately; historical rows are preserved |
| `workspaces` (new) | Core | Exactly one owner: `owner_user_id` **XOR** `organization_id`. `kind` derived from owner, not a free flag. One `is_default` personal workspace per user; one default workspace per organization. Additional personal workspaces allowed by plan |
| `workspace_memberships` (new) | Core | Exactly **one active role** per (workspace, user). Status `active / deactivated / ended` (enum OPEN, Q-05). At least one eligible Workspace Manager must remain (enforced transactionally). For org workspaces, active org membership is an additional prerequisite |
| `departments` (replaced form) | **Workspace-scoped** | Optional, **flat in v1** — no parent hierarchy, no `team` entity. A user may belong to zero/one/many departments *within a workspace*. Departments are grouping/responsibility, never a data-isolation boundary |
| `roles`, `permissions`, `permission_role` (replaced form) | Scoped (`scope = platform / organization / workspace`) | Stable permission keys (`content.publish`, …). Two protected workspace roles seeded per workspace: **Workspace Manager**, **Member**; custom workspace roles allowed. Platform roles (e.g. system admin) are a separate scope and never implicitly workspace roles. Grant-ceiling rule: nobody may grant a permission they do not themselves hold (PROPOSED, ADR-0004) |
| `organization_role_templates` + link (later slice) | Organization | Org admins may define templates; a workspace role keeps its own copy. Template changes propagate **only after preview + explicit confirmation**, applied atomically or with a documented recoverable plan (playbook rule 9). Concurrency semantics **OPEN** (Q-06) |
| `module_definitions`, `workspace_modules`, org module policy (new, Stage 07 slice) | Core | Feature/module registry. New features are **disabled in all plans by default** |
| `plans`, plan versions/prices, `subscriptions`, subscription change history, `payment_attempts` (new, Stage 07 slice) | Core billing | One effective personal subscription per user (covers that user's personal workspaces); one effective org subscription per organization (covers all its workspaces). Payments/attempts ≠ subscription. Manual activation first; no payment provider, no auto-renewal in scope. **Subscription lifecycle/status semantics are OPEN (Q-01) and must not be invented in code** |
| Scoped `settings` (replaces global-only `system_settings` semantics) | Platform / organization / workspace scopes | Each setting declares scope, type, default, validation, and whether a lower scope may override a mandatory higher-scope policy |
| File metadata + module file links (Core service over existing DAM tables) | Core service; modules own meaning | Download/preview re-checks permission **and** workspace of the linked record. A URL alone (incl. signed temporary links) is not authorization; link TTL/revocation behavior OPEN (Q-09) |
| `notifications` inbox (Core) | Core; modules produce events/content | Inbox/read-state in Core; Bale/Google are delivery adapters, not sources of truth |
| `audit_logs` (new, distinct from `activity_logs`) | Core | Security/management events: membership, role, policy, subscription, sensitive settings. `activity_logs` (CONFIRMED: user-facing feed) is retained as an activity feed and is **not** an audit log |
| Domain-event outbox (new, only if operable) | Core | See §9 / ADR-0011. The existing `bale_outbox` is a Bale-specific precedent, not the general outbox |

### 2.1 Ownership decision flow (every operational read/write, in order, deny-by-default)
1. Authenticated, platform-active user.
2. Workspace resolved server-side from the resource/route — never trusted from a client-supplied `workspace_id` alone.
3. Personal workspace → requester is its owner or an active workspace member; org workspace → **active organization membership AND active workspace membership**.
4. The membership's single active role holds the required stable permission key.
5. Module is activated for the workspace **and** not prohibited by organization policy **and** entitled by the effective subscription (capability gate ≠ permission gate; both must pass).
6. Resource's `workspace_id` equals the resolved workspace (list, detail, mutation, search, export, file, notification, background job — no exceptions).
7. Resource limits (members/workspaces/storage) enforced as in §7.

Organization administrators get **no implicit workspace data access**; they may assign workspace managers and, where explicitly permitted, join a workspace with an authorized role (playbook rules 5, 7).

## 3. Legacy identity mapping (revised strategy — replacement, not backfill)

Because no production data must be preserved (user clarification, CONFIRMED as project direction), the legacy model is **replaced by seeding/recreation in disposable development databases**, not backfilled in place:

- `users.role_id` / `users.role_key` (CONFIRMED dual source) → **removed** after workspace RBAC exists; seeds create platform admin + memberships with workspace roles instead. No dual-write period.
- `department_user.pivot.role` (free-text third role source) → **removed**; department membership becomes a plain pivot.
- `users.department_id` (primary department) → **removed** once workspace-scoped department membership exists; "primary department" analytics semantics, if still wanted, become an explicit pivot flag (OPEN, Q-07).
- `departments.parent_id` hierarchy + `teams`/`team_user`/`dam_data_table_team` + `DepartmentConsolidation` runtime gate → **removed** (ADR-0006); development databases are recreated rather than consolidated.
- The existing installation, if a development/staging database is ever converted instead of reset, maps to **one Organization with one default workspace** (ADR-0007) — but the default path is reset + seed, and **any reset of a shared/staging/production database requires separate explicit authorization** (revised-strategy rule 9; this document authorizes no reset).

## 4. Module boundaries (target ownership matrix)

| Module | Owns (target) | Current code that maps here (CONFIRMED locations) | Notes |
|---|---|---|---|
| **Platform/Core** | Identity, organizations, workspaces, memberships, RBAC, scoped settings, module registry, plans/subscriptions, audit, notifications inbox, file-access service, background/event plumbing | `User/Role/Permission/Department`, `SystemSetting`, `ActivityLog`, `Services/Access/*`, `Services/Organization/*` | New bounded code under a Core namespace from Stage 02; legacy classes are replaced slice-by-slice, not wrapped forever |
| **Projects & Tasks** | `projects`, `project_user`, `project_templates`, `project_content_plans`, `tasks`, `task_attachments` | `Project*`, `Task*`, `ProjectTemplateApplication`, `TaskOperations`, automations | Project membership remains a module concept, distinct from workspace membership |
| **Content** | `contents`, `content_series*`, `content_watchers`, `series_batch_requests`, publication workflow | `Content*` controllers/services, `ContentCodeAllocator` | JSON payload fields that carry access semantics (department IDs, participants) must become columns/relations when this module is migrated — payloads must not remain an authorization source |
| **DAM & Files** | `dam_*` tables, storage, versions, data tables | `Dam*` controllers/services/models | Core provides file storage/access contracts; DAM owns asset semantics |
| **Operational Records** (successor to `workspace_records` + parts of `domain_records`) | Ideas, think-tank meetings, secretariat letters/resolutions, archive dossiers | `WorkspaceRecord*`, `workspace_records` table | Renamed per ADR-0005; JSON payload to be normalized per record kind when each kind is migrated |
| **Chat & Comments** | Conversations/messages (today inside `domain_records`), `comments` | `DomainRecord*`, `ChatAccess`, `Comment*` | Chat gets real tables when migrated; membership enforced server-side (already the post-Phase-1 direction) |
| **Notifications** | Inbox, preferences, delivery state | `NotificationInbox`, `domain_records(notification)`, Bale notification classes | Producers publish events; Core owns inbox |
| **Integrations (adapters)** | Bale bot, Google Workspace | `app/Bot/Bale/**`, `Google*` services | Adapters call Core/module contracts; they re-check authorization through the same central decision (§2.1), never a parallel permission copy |
| **Reporting** | Search, analytics, integrity diagnostics | `GlobalSearchController`, `AnalyticsController`, `Integrity*` | Must become workspace-scoped projections; "organization-wide" (today: whole installation) aggregates are redefined per scope in ADR-0008 |

No module writes directly into another module's tables; synchronous in-process contract calls for immediate answers, domain events for cross-module reactions (draft core §5, retained).

## 5–7. Settings/files/notifications; subscriptions and limits
Retained from draft core §§6–7 with the playbook's corrections: scoped settings with non-overridable mandatory higher-scope policies; Core-mediated file access; Core notification inbox with channel adapters; audit of sensitive changes. Subscription/limit behaviors (over-limit workspace/member/storage handling, impact preview + confirmation on plan change, price snapshot at purchase, manual renewal, history preservation) follow playbook rules 10–13 verbatim as requirements; **all lifecycle status semantics remain OPEN (Q-01)** because the draft core §7 prose ("post-expiry read/export may continue", price-change timing) reads as decided while the playbook explicitly declares these open. In conflict, the playbook's OPEN wins.

## 8. Background processing and events (hosting-bound)
CONFIRMED constraints: shared hosting, no SSH/Cron evidence, `QUEUE_CONNECTION=sync`, no workers, no queued jobs in code today. Therefore (ADR-0011): default to synchronous execution + idempotent, externally-triggered "tick" endpoints/commands (the existing Bale pattern); introduce a transactional outbox **only** for events whose loss is consequential **and** only with a drain mechanism proven operable on the actual host. Redis/database queues, long-running workers, and assumed scheduler availability are prohibited assumptions until host evidence exists (UNKNOWN, Q-03).

## 9. Database-engine contract
Production profile is MySQL; development/CI are SQLite (CONFIRMED divergence; prod MySQL version/engine **UNKNOWN**, Q-02). Rules (ADR-0009): domain validation enforces every invariant on both engines; DB-level constraints (XOR ownership, uniqueness of defaults, one-active-role) are added wherever the *verified* engines support them, with engine-specific migrations kept explicit (the repo already carries MySQL-ENUM vs SQLite-CHECK divergence — that pattern must not grow silently). No schema decision in Stage 03 may promise a MySQL constraint before the production MySQL version is evidenced.

## 10. Acceptance criteria (target state, from draft core §10 — retained)
Org member without workspace membership cannot read/modify workspace data; changing a record ID cannot cross workspaces; org-membership deactivation blocks all its workspaces; module activation without permission grants nothing; permission cannot override org policy or plan limits; files/search/notifications/exports/background jobs obey the same isolation; sensitive changes are audited and tested; a new module can be added without editing unrelated modules' internals. Each criterion needs an automated adversarial test in its implementing stage.

## 11. Explicitly out of scope for v1 Core
Automatic payments/billing complexity, temporary roles, per-member permission overrides, general cross-workspace data transfer, nested departments, team entity, advanced file-retention system (draft core §9, retained). Frontend/visual redesign is out of scope for every backend stage (another contributor owns the Design System; functional API coordination only).

## 12. Reconciliation log (draft PR #13 → this document)
| # | Draft statement | Disposition |
|---|---|---|
| 1 | Draft presented as "architecture under review" | **Kept honest:** this reconciled version is PROPOSED until this PR is approved; PR #13 remains an open draft and should be closed/superseded by the human reviewer, not by the agent (agent constraint: no merge/close) |
| 2 | Roadmap Phase 2 combined "create core tables" + "assign existing data to workspaces" | **Split** per playbook Stages 03/04; under the revised strategy the data-assignment half is further replaced by reset+seed (§3), see roadmap |
| 3 | Core §7 subscription prose read as decided | **Downgraded to OPEN (Q-01)** per playbook rule 13 |
| 4 | "Department within a workspace", flat v1 | **Adopted as PROPOSED (ADR-0006)**; contradicts current `parent_id` hierarchy — resolved in favor of the target, legacy hierarchy removed rather than adapted |
| 5 | Conceptual table list (§8 of draft) | **Adopted with corrections:** adds `audit_logs` distinct from `activity_logs`; flags JSON-payload authorization data in Content/Operational Records as to-be-normalized |
| 6 | No mention of the `workspace_records` naming collision, Bale as a second access surface, or tracked `vendor/` release model | **Added** (§§2–4, ADR-0005/0008); these are Stage 00 findings the draft predates |
| 7 | Draft roadmap's cautious legacy-preserving data policy (per-table mapping sheets, exception register) | **Superseded by the user's revised strategy** for development data; retained only as the fallback if any database is later declared non-disposable (roadmap §6) |
