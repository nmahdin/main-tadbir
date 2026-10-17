# Core v1 Data Model & Schema Plan (design only — no migrations executed)

Conventions: PK `id` BIGINT UNSIGNED; FKs `restrictOnDelete` wherever history must survive (memberships precedent, Stage 03A MySQL-1215 lesson); statuses are strings validated by PHP enums (ADR-0009, no new native MySQL ENUMs); generated discriminator columns + unique indexes replace partial indexes portably on SQLite/MySQL; historical tables are append/preserve — lifecycle ends rows, never deletes them. Status column shown as `status` string(20) unless noted.

## 1. Existing Core tables (CONFIRMED at `7b90a73`) — retained as designed

| Table | Responsibility | Key constraints (implemented) |
|---|---|---|
| `users` (legacy, retained) | Platform identity | status legacy enum; **plan:** normalize to `active/suspended/deactivated` + drop legacy role columns at identity cutover (see §4) |
| `organizations` | Organization owner of workspaces/billing | slug unique; status; created_by nullOnDelete |
| `workspaces` | Operational boundary | `owner_user_id` XOR `organization_id` (model both engines; MySQL CHECK), one-default discriminators (`default_personal_owner_id`, `default_organization_id` unique), indexes (owner,status),(org,status) |
| `organization_memberships` | Org management-plane membership | live-uniqueness `(organization_id, live_user_id)`; user FK RESTRICT; org FK CASCADE; `deactivated_at/ended_at`; `role_id` → core_roles RESTRICT |
| `workspace_memberships` | Operational membership | same pattern per workspace |
| `core_permissions` | DB mirror of code catalog | key unique; scope check (MySQL) |
| `core_roles` | Scoped roles | scope container XOR (MySQL CHECK; SQLite model), per-owner key uniqueness via `scope_owner_id` discriminator, `is_protected` |
| `core_role_permissions` | Role↔permission | unique (role_id, permission_id), CASCADE from role/permission |
| `projects`, `project_content_plans`, `tasks` | (Module tables, pilot) | nullable `workspace_id` FK RESTRICT added 04B; become NOT NULL at module cutover stages (dev recreation, not in-place backfill) |

## 2. Proposed new Core tables (PROPOSED — implement per roadmap)

### Identity / platform
| Table | Columns (essentials) | Constraints |
|---|---|---|
| `platform_role_assignments` | user_id FK RESTRICT, role_key (catalog platform scope), granted_by, timestamps | unique (user_id, role_key); not a membership — no workspace linkage permitted by construction |

### Invitations (§C)
| Table | Columns | Constraints |
|---|---|---|
| `invitations` | scope_type (`organization`/`workspace`), scope_id, invitee_type (`email`/`phone`/`username`), invitee_value (normalized), role_id FK RESTRICT (scope must match), **`invited_permission_keys` JSON — invite-time snapshot of the invited role's key set** (acceptance validates the live role is still a subset of the snapshot), token_hash unique, status (`pending/accepted/accepted_pending_org_approval/expired/cancelled/rejected` — state machine in spec §C), expires_at, invited_by FK, **org_approval_status (`not_required/pending/approved/rejected`)**, **org_approval_decided_by FK nullable, org_approval_decided_at nullable, org_approval_reason nullable**, accepted_by_user_id nullable, accepted_at nullable, **activation_at nullable** (when memberships became active), resulting_org_membership_id nullable, resulting_workspace_membership_id nullable, cancel_reason nullable | index (scope_type, scope_id, status); index (invitee_value, status); token never stored raw; one live actionable invitation per (scope, invitee): generated discriminator over statuses `pending/accepted_pending_org_approval` + unique. Membership rows are created **only** at activation (after approval where required) — a pending-approval invitation has no membership rows |
| `organization_onboarding_policies` | organization_id PK/FK CASCADE, `workspace_invites_create_org_membership` (`allow/require_org_admin_approval/deny`, default row absent = `require_org_admin_approval` effective default), updated_by FK, timestamps | One row per organization; written/read only by holders of `organization.members.manage`; every change audited (C1). This is a dedicated table owned by the invitations slice (C6) — it does **not** depend on scoped settings (C7), which may later expose it through the settings UI without owning the data |

### Departments (§C)
| Table | Columns | Constraints |
|---|---|---|
| `workspace_departments` | workspace_id FK RESTRICT, name, manager_user_id nullable FK nullOnDelete | unique (workspace_id, name); flat — no parent column by design |
| `workspace_department_members` | department_id FK CASCADE, user_id FK RESTRICT, is_primary bool | unique (department_id, user_id); one-primary-per-(workspace,user) via generated `primary_user_key` (department's workspace must be joined — store denormalized `workspace_id` FK for constraint + index integrity, service-validated) |

### Plans / subscriptions / entitlements (§E)
| Table | Columns | Constraints |
|---|---|---|
| `plans` | scope (`personal`/`organization`), name, status (`draft/active/retired`), current_version_id nullable | index (scope, status) |
| `plan_versions` | plan_id FK RESTRICT, version int, limits JSON (`max_workspaces`, `max_members_per_workspace`, `storage_bytes`, `modules` map, `features` map), price_amount_cents int, price_currency char(3), period_months int, published_at | unique (plan_id, version); immutable after publish (service rule) |
| `subscriptions` | subscriber discriminator: `subscriber_user_id` nullable FK RESTRICT XOR `subscriber_organization_id` nullable FK RESTRICT (model + MySQL CHECK pattern), plan_version_id FK RESTRICT, status (`pending/active/past_due/suspended/expired/cancelled`), period_start, period_end, cancelled_at nullable | one-effective-per-subscriber: generated `effective_subscriber_key` (user or org id + scope marker) applied to non-terminal rows + unique — same discriminator technique as memberships; index (status, period_end) for renewal ticks |
| `subscription_events` | subscription_id FK RESTRICT, event (`created/activated/renewed/upgraded/downgraded/past_due/suspended/expired/cancelled`), actor_user_id nullable, payload JSON (price/limit snapshot), created_at | append-only; index (subscription_id, created_at) |
| `payment_attempts` | subscription_id FK RESTRICT, provider (string, `manual` in v1), amount snapshot, status (`initiated/succeeded/failed/void`), external_reference nullable, created_by | no card data columns by design; success only transitions subscription via service |

### Settings & module activation (§F)
| Table | Columns | Constraints |
|---|---|---|
| `core_settings` | scope_type (`platform/organization/workspace/user`), scope_id (0 for platform), key, value JSON, is_mandatory bool (higher-scope lock), is_sensitive bool (encrypted cast), updated_by | unique (scope_type, scope_id, key); key registry in code declares scope/type/default |
| `module_definitions` | module_id (string PK), version, manifest_snapshot JSON, is_active (platform kill-switch) | materialized from manifests at registration |
| `workspace_modules` | workspace_id FK CASCADE, module_id FK, state (`enabled/disabled`), updated_by | unique (workspace_id, module_id) |
| `organization_module_policies` | organization_id FK CASCADE, module_id FK, max_state (`enabled/disabled`) — ceiling only | unique (organization_id, module_id) |

### Files (§G)
| Table | Columns | Constraints |
|---|---|---|
| `files` | workspace_id FK RESTRICT **NOT NULL**, disk, path, original_name, mime, size_bytes, checksum, uploaded_by, status (`active/pending_delete/deleted`), deleted_at nullable | index (workspace_id, status); unique (disk, path); storage quota derives from SUM(size_bytes) per workspace (cached counter optional later) |
| `file_links` | file_id FK CASCADE, owner_module, owner_record_type, owner_record_id, purpose | index (owner_module, owner_record_type, owner_record_id); one file may serve several records; download authorizes via the linked record |
| `file_signed_links` | file_id FK CASCADE, token_hash unique, expires_at, revocation_epoch int, issued_by, consumed_at nullable | validity = not expired ∧ epoch = workspace current epoch (epoch stored on `workspaces.file_epoch` int default 0 — proposed column) |

### Notifications (§H)
| Table | Columns | Constraints |
|---|---|---|
| `notifications` | user_id FK CASCADE, workspace_id nullable FK RESTRICT, type key, payload JSON, read_at nullable | index (user_id, read_at, created_at) |
| `notification_deliveries` | notification_id FK CASCADE, channel (`bale/email`), status (`pending/sent/failed/cancelled`), attempts, next_attempt_at, last_error (masked) | index (status, next_attempt_at) for tick draining |

### Audit & events (§I, §J)
| Table | Columns | Constraints |
|---|---|---|
| `audit_logs` | actor_user_id nullable, actor_scope_type/id, workspace_id nullable, organization_id nullable, action key, target_type/id, summary JSON (masked), ip, user_agent, created_at | append-only (no updated_at); indexes (workspace_id, created_at), (actor_user_id, created_at), (action, created_at) |
| `core_outbox` | event_id UUID unique, event_key, workspace_id nullable, payload JSON, attempts, available_at, processed_at nullable, dead_at nullable | index (processed_at, available_at) |

## 3. Indexes & query-shape notes
Authorization hot paths already indexed (membership (scope,status)/(user,status)). Add at implementation: subscriptions renewal scan (status, period_end); settings unique lookup (above); files per-workspace sums (workspace_id,status); audit per-workspace feeds (above). No speculative composite indexes beyond named queries.

## 4. Existing constraints requiring refinement (explicit list)
1. **SQLite XOR parity (known gap):** workspace single-owner XOR and core_roles scope-container match are model-enforced on SQLite (SQLite cannot ALTER-add CHECK). Durable fix = fresh-schema table rebuild creating tables *with* CHECKs from the start — authorized only in a disposable-dev recreation stage; production MySQL already enforces. Decision needed (OD-5): accept rebuild at the Core schema-freeze stage, or accept permanent model-only enforcement on SQLite with MySQL as the enforcing engine.
2. **`users.status` native MySQL ENUM** (`active/inactive/blocked/pending`): replace with string + enum validation during identity normalization; MySQL ENUM edits are the repo's known divergence pattern (do not extend it).
3. **Membership `role_id` nullable:** schema-nullable by design (history), domain-guaranteed non-null for active rows — keep; do not add NOT NULL (would break ended-row history).
4. **Legacy tables scheduled for removal at cutovers:** `roles/permissions/permission_role` (legacy catalog), `departments` (+`parent_id`), `department_user`, `teams`, `team_user`, `users.role_id/role_key/department_id`, legacy `system_settings` (after scoped settings inventory). Removal only in their cutover stages with tests (roadmap), never in this design stage.
5. **`tasks`/`projects` nullable workspace_id:** transitional (dual-mode pilot). Target NOT NULL at module cutover via dev recreation; production path (if a database is ever declared non-disposable) requires the ADR-0007 fallback machinery — not invented here.
6. **MariaDB:** generated-column + CHECK behavior assumed from MySQL CI only; MariaDB remains NOT TESTED (register Q-02 follow-up).
