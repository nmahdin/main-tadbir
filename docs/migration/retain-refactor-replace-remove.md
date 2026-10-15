# Disposition Inventory — Retain / Refactor / Replace / Remove (Stage 01)

Scope: tables, models, services, APIs, concepts at baseline `b30bfef…`. **Retain** = keep as-is conceptually. **Refactor** = keep behavior, move/restructure per `docs/PROJECT_STRUCTURE.md` when its module migrates. **Replace** = new target implementation supersedes it (old deleted after replacement tests pass). **Remove** = obsolete, deleted without replacement. Stage column = when the disposition is executed (never in Stage 01).

## Tables / schema concepts
| Item | Disposition | Stage | Note |
|---|---|---|---|
| `users`, `personal_access_tokens`, `sessions` | Retain (identity) | 03 touches | Loses `role_id/role_key/department_id` (Replace→Remove, ADR-0004/0006) |
| `roles`, `permissions`, `permission_role` | Replace (scoped roles) | 03 | Names kept, contracts change; seeded Workspace Manager/Member |
| `departments`, `department_user` | Replace (workspace-scoped flat) | 03/05 | Drops `parent_id`, pivot `role`, `legacy_team_id` (Remove) |
| `teams`, `team_user`, `dam_data_table_team`, `DepartmentConsolidation` gate + middleware | Remove | 03/05 | No team entity (ADR-0006); dev schema recreated |
| `projects`, `project_user`, `project_templates`, `project_content_plans` | Retain + `workspace_id` | 04/05 | Reference slice for isolation |
| `tasks`, `task_attachments`, `comments` | Retain + `workspace_id` (denormalized via project/content consistency enforced) | 05 | Unified `comments` kept |
| `contents`, `content_series*`, `content_watchers`, `series_batch_requests` | Retain + workspace scope; **Refactor payload**: access-bearing payload fields → columns/relations | 05 | JSON remains for schemaless content only |
| `workspace_records` | Replace → `operational_records` (ADR-0005), payload normalized per kind | 05 | Routes may stay stable |
| `domain_records` | Replace (chat/messages/notifications get real tables/inbox) | 05 | Highest-risk JSON store; retire after Chat + Notifications slices |
| `dam_*` (folders/categories/assets/files/versions/relations/tags/data tables) | Retain + workspace scope | 05 | Core file-access contract wraps storage/download (ADR-0008) |
| `system_settings` | Replace → scoped settings registry | 03/07 | Platform/org/workspace scopes classified per Q-11 |
| `activity_logs` | Retain as activity feed; **not** audit | 05/07 | New `audit_logs` (Core) added alongside |
| `bale_*` (8 tables incl. `bale_outbox`) | Retain as adapter state | 05/07 | Outbox generalized only per ADR-0011 conditions |
| `google_workspace_links` | Retain as adapter state | 05 | Adapter calls contracts |
| `cache*`, `jobs*`, `failed_jobs` | Retain (framework) | — | Queue stays `sync` until ADR-0011 evidence changes |
| New: `organizations`, `workspaces`, `organization_memberships`, `workspace_memberships` | Create clean | 03 | ADR-0002/0003 |
| New: `module_definitions`, `workspace_modules`, `plans`, `subscriptions`, `payment_attempts`, `audit_logs`, (conditional outbox) | Create clean | 06/07 | ADR-0010/0011 |

## Models / services / code areas
| Area (current location) | Disposition | Stage |
|---|---|---|
| Business services with real logic (`ContentPublication/Review`, `SeriesOccurrenceService`, `DamService`, `TaskOperations`, automations, Bale handlers' business rules) | Refactor (move into owning module; rules preserved) | 05 per module |
| Access patchwork (`ContentAccess`, `ChatAccess`, `Dam*Access`, `TaskOperations::visibleTo`, Bale permission copies, `UserPermissionGate`) | Replace → `Core/Access` central decision + thin Policies | 04, completed per module 05 |
| God classes (`GoogleWorkspaceService` 894, `DamAssetController` 863, `SettingsView.tsx`/`DamDataTables.tsx` 1723) | Refactor (split on module touch; budgets in CODING_STANDARDS §7) | 05 / frontend feature touches |
| `Services/Organization/DepartmentConsolidation`, `EnsureDepartmentStructure` | Remove (with teams) | 05 |
| `App\Events\ContentPublished`, Bale outbox/tick pattern | Retain as patterns | 07 |
| Seeders (`Permission/Role/User/PublishingPlatform`) | Replace (Core + per-module seeds/factories) | 03/05 |

## APIs
| API surface | Disposition |
|---|---|
| `/api/v1` resource routes (projects/tasks/contents/DAM/…) | Retain shapes where practical; change where workspace context/RBAC requires (revised strategy §5) — each change listed + contract-tested in its module PR |
| Auth (Sanctum cookie + token) | Retain; add workspace-context/membership endpoints (03) |
| Bale webhook/tick/panel | Retain externally; internals become adapter calls (05) |
| Global search / analytics / activity | Replace with scoped projections (05 Reporting) |
| Permission catalog | Backendcanonical; frontend generated/parity-tested (02/03) |

## Concepts
| Concept | Disposition |
|---|---|
| Global single role; `role_key` shadow; department-as-access-grant; team; installation = "organization"; payload-carried membership/votes; activity log = audit; queue/scheduler assumptions | **Remove / Replace** per ADR-0004/0006/0008/0011 |
| Project membership; content workflow/series; DAM versioning; Bale idempotency/outbox patterns; Jalali UX; Sanctum SPA auth | **Retain** (valuable working behavior) |
