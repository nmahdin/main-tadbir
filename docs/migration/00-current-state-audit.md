# Stage 00 — Current-State Audit and Migration Baseline (READ-ONLY)

- **Stage:** 00 only (repository audit). No Stage 01 work performed.
- **Status:** NEEDS REVIEW
- **Repository / branch audited:** `nmahdin/main-tadbir`, `arena/582a70e5-main-tadbir`
- **Exact commit:** `b30bfefdeb4550fa971e76006c42af143c19e745` (= `main` / `origin/main` at audit time; merge of PR #8)
- **Date of audit:** 2026-10-15 (UTC)
- **Production touched:** No. No deploy, no production migration, no production data read or written, no credentials or real user records inspected.
- **Code/schema changes in this stage:** None. This report is the only file added.

> Uncertainty convention: **CONFIRMED** = directly observed in the checked-out code/docs/CI at the commit above. **UNKNOWN** = cannot be proven from the repository (host/production fact) and must be verified by a human with host access. **STALE** = a committed document/inventory that no longer matches the code at this commit.

---

## 1. Executive summary

1. The application is a **single-tenant** Laravel 13 + React 19 system today. There are **no** `organizations`, `workspaces` (in the playbook sense), `organization_memberships`, `workspace_memberships`, subscriptions, plans, or `workspace_id` columns anywhere in `backend/app`, `backend/database`, or `backend/routes` (grep: zero hits for `workspace_id` / `organization_id`). **CONFIRMED**
2. Current authorization is a **single global role per user** (`users.role_id` + denormalized `users.role_key`), a global permission catalog (78 keys), one primary department (`users.department_id`) plus a `department_user` pivot that carries its own free-text pivot `role`. This is structurally incompatible with the target "one active role per workspace membership" model and is the largest migration risk. **CONFIRMED**
3. The word **"workspace" is already used for something else**: `workspace_records` / `App\Models\WorkspaceRecord` is a polymorphic store for ideas, think-tank meetings, secretariat letters/resolutions and archive dossiers; the frontend likewise has `src/components/workspace/*` and `src/api/workspaceRecords.ts` meaning "operational workspace pages", not a tenant workspace. Introducing a real `workspaces` table without a naming/terminology decision will collide conceptually and in developer communication. **CONFIRMED — conflict, see §9 C3.**
4. The two architecture source documents named by the playbook (`docs/architecture/core.md`, `docs/roadmap/migration-to-tadbir-comprehensive.md`) **do not exist on `main`**. They exist only as an unmerged **draft PR #13** (`docs/core-architecture-migration`, head `ef5ded49a4e6b2e8f5b720343cac9254b14ff400`, OPEN/DRAFT, docs-only, 2 files). They are therefore **drafts, not approved architecture**, and per the playbook §0 they must be imported/reconciled in a documentation-only PR (Stage 01) — not silently treated as ratified. **CONFIRMED**
5. No ADRs exist anywhere in the repository (no `docs/adr*`, no ADR files). **CONFIRMED**
6. The production database is **MySQL** (per `backend/.env.example`: `DB_CONNECTION=mysql`, host domains `api-tadbir.morvarid-daron.ir` / `tadbir.morvarid-daron.ir`), while local dev and all CI/tests run **SQLite**. Several migrations are engine-specific (raw MySQL `ENUM` `DB::statement(...)` vs SQLite CHECK-constraint repair), so "tested on SQLite" is **not** evidence for MySQL. Production MySQL version, storage engine, transaction/charset details: **UNKNOWN**. **CONFIRMED (divergence) / UNKNOWN (prod characteristics)**
7. Hosting is **shared hosting without SSH or Cron** (per `docs/deployment.md`, `docs/operations.md`, `docs/environment.md`). Consequences already visible in code: `QUEUE_CONNECTION=sync`, `CACHE_STORE=file`, `SESSION_DRIVER=file`, no queue workers, Laravel scheduler entries exist (`routes/console.php`: `bale:tick` every minute, plus overdue/content-code artisan commands) but **there is no evidence any scheduler actually runs on the host**; the Bale bot instead offers a secret-protected HTTP `tick` endpoint for an external scheduler. Backup/restore capability, RPO/RTO and any restore rehearsal are **UNKNOWN** — `docs/operations.md` itself states they are unapproved/unproven. **CONFIRMED (constraints as documented) / UNKNOWN (host reality)**
8. Test baseline at this commit is **green in CI** (see §8) and **green locally for the frontend** (140/140, typecheck pass). Backend PHPUnit was **NOT RUN locally** — no PHP/Composer binary exists in this sandbox (`php: command not found`). Pre-existing historical CI failures on `main` (several `failure`/`cancelled` runs before the current HEAD) exist; only the HEAD run is green. **CONFIRMED**

---

## 2. Stack and dependency inventory

| Layer | Observed | Source |
|---|---|---|
| PHP | `^8.3` required; CI uses 8.4; sandbox has **no PHP** | `backend/composer.json`, `.github/workflows/quality.yml` |
| Laravel | `^13.17`; Sanctum `^4.3`; Tinker `^3.0` | `backend/composer.json` |
| Backend dev tools | PHPUnit `^12.5.12`, Pint `^1.27`, Faker, Mockery, Laravel Boost/Pail/Pao | `backend/composer.json` (require-dev) |
| Frontend | React `^19.0.1`, TypeScript `~5.8.2`, Vite `^6.2.3`, Tailwind CSS `^4.1.14` (`@tailwindcss/vite`), React Router `^7.18.4`, TanStack Query `^5.104.0`, `date-fns` + `date-fns-jalali` (Persian calendar is a first-class concern), lucide-react, motion, recharts | `frontend/package.json` |
| Node | CI Node 22; sandbox Node v22.22.3 / npm 10.9.8 — `npm ci` succeeded | `.github/workflows/quality.yml`, local run |
| Backend JS | Separate legacy Laravel/Vite scaffold (`backend/package.json`, Vite `^8.0.0`) — **not** the product frontend; do not confuse the two | `backend/package.json` |
| Database (prod profile) | MySQL, `utf8mb4` / `utf8mb4_unicode_ci`, strict mode | `backend/.env.example`, `backend/config/database.php` |
| Database (local/CI/test) | SQLite (`:memory:` in `phpunit.xml`; file DB locally) | `backend/.env.local.example`, `backend/phpunit.xml` |
| Cache / Session / Queue (prod) | file / file / **sync** | `backend/.env.example` |
| Cache / Session / Queue (config defaults) | database / (Laravel default) / database — **env overrides are load-bearing** | `backend/config/cache.php`, `queue.php` |
| Filesystem | `local` disk (`storage/app/private`), `public`, `s3` defined but unused by default | `backend/config/filesystems.php` |
| Auth | Sanctum stateful SPA cookie session for browsers; personal access tokens only via `POST /api/v1/auth/token` for non-browser clients | `docs/deployment.md`, `backend/routes/api.php`, `AuthController` |
| Mail | Disabled (`MAIL_MAILER=array`); accounts are **username-only, no email** | `.env.example`, `docs/username-accounts.md` |
| External integrations | Bale messenger bot (webhook + polling + secret tick), Google Workspace (Drive/Docs/Sheets/Calendar/Meet) | `backend/app/Bot/Bale/*`, `backend/app/Services/Google*`, `docs/google-workspace.md` |

Repo hygiene facts that affect every future stage:

- **`backend/vendor/` is tracked in Git (9,329 of 10,125 tracked files)** and `frontend/dist/` is intentionally tracked (137 files) as the shared-host release artifact, per documented policy in `docs/deployment.md` ("host accepts ready files; no SSH"). Any future PR will be huge/noisy unless this is explicitly left alone. Do not "fix" this inside a migration stage without a separate decision. **CONFIRMED**
- No real `.env` is tracked (only `*.example` profiles; guarded by `TrackedEnvironmentFilesTest` / `EnvironmentExamplesTest`). **CONFIRMED**

---

## 3. Schema inventory (from migrations, not from a live database)

- **56 migration files**, creating **57 tables** at creation points (plus later alterations). This is a migration-derived inventory; the *actual* production schema was not inspected and may differ (manual MySQL patches exist under `docs/deployment/*.mysql.sql` and `docs/security/*.mysql.sql`). **CONFIRMED (code) / UNKNOWN (prod parity)**
- Migration style is engine-aware and partly **forward-only**: e.g. `2026_09_28_120000_consolidate_department_structure.php` throws in `down()` ("restore a verified backup"), several migrations rewrite JSON payloads in `up()`. Rollback of schema ≠ rollback of data — matches the playbook warning.
- Aggregate constraint signals across migrations: ~103 `foreignId`, ~47 `unique`, ~55 `index`, 46 `cascadeOnDelete`, 46 `nullOnDelete`, 12 `restrictOnDelete`; only **one** model uses `SoftDeletes` (`DamAsset`). Most "deletion" elsewhere is status-based archiving (`archived` status + `RestoreController` for projects/tasks/contents only).

### 3.1 Table groups and migration-relevant notes

| Group | Tables | Notes for workspace migration |
|---|---|---|
| Identity & access | `users`, `roles`, `permissions`, `permission_role`, `departments`, `department_user`, `personal_access_tokens`, `sessions` | `users.role_id` (FK, nullOnDelete) **and** `users.role_key` (string) duplicate one relationship; `users.department_id` primary dept + `department_user` pivot (`department_id,user_id` PK, pivot `role` string, `joined_at`); `users.status ∈ {active,inactive,blocked,pending}`; `departments.parent_id` self-FK + `manager_id`, `legacy_team_id` unique |
| Legacy teams (**still present**) | `teams`, `team_user`, `dam_data_table_team` | Created 2026-09-13; **no Eloquent model**; superseded by departments via `DepartmentConsolidation` service + `EnsureDepartmentStructure` middleware, but tables are **not dropped** and consolidation is a runtime phase gate (`system_settings` key `department_consolidation_private`, phases `teams→…→done`) that can still block non-bootstrap requests. A record's "current" department semantics depend on this gate having completed on the host — **UNKNOWN on prod** |
| Projects & tasks | `projects`, `project_user`, `project_templates`, `project_content_plans`, `tasks`, `task_attachments`, `comments` (legacy `task_comments` created then superseded by unified `comments`) | `tasks`: project/content/stage links, assignee, JSON `tags`/`dependencies`/`subtasks`/`context`; project membership is `project_user` pivot — the closest existing analogue to "membership", but project-scoped, not workspace-scoped |
| Content | `contents`, `content_series`, `content_series_revisions`, `content_watchers`, `series_batch_requests` | `contents.payload` JSON is semi-structural (topic, status mirror, series code); stable `code` column added later with backfill command; series has `lock_version`, revisions, idempotency via `series_batch_requests.request_key` |
| Generic record stores (**high risk**) | `workspace_records`, `domain_records` | `workspace_records(kind,title,status,owner_id,project_id,client_request_id,payload JSON)` holds ideas/meetings/letters/resolutions/dossiers; `domain_records(domain,user_id,parent_id,title,status,payload JSON)` holds notifications, DAM folder/asset mirrors and **chat conversations/messages**. Ownership, membership, votes, referrals, chat membership etc. live **inside JSON payloads**, not columns — deterministic workspace attribution (Stage 04) will have to parse payloads, and some payload relationships have no FK integrity |
| Settings & audit (current) | `system_settings`, `activity_logs` | `system_settings(key,value JSON,updated_by)` is installation-global (also stores Bale config and the consolidation gate); `activity_logs(user_id,action,type,details,task_id,project_id,metadata)` is a user-facing activity feed, **not** a security audit log (sensitive changes like role edits are not guaranteed captured — no audit-trail model exists) |
| DAM | `dam_folders`, `dam_categories`, `dam_assets`, `dam_files`, `dam_content_items`, `dam_versions`, `dam_relations`, `dam_activities`, `dam_tags`, `dam_asset_tag`, `dam_data_tables`, `dam_data_rows`, `dam_data_row_activities`, `dam_data_table_versions`, `dam_data_table_department` | Richest sub-schema: `dam_assets` SoftDeletes + `access_grants` JSON + `confidentiality`, `department_id`, owner/creator/updater; data tables have `grants` JSON and department pivots. Folder hierarchy via `parent_id` (nested) — separate from department hierarchy |
| Bale bot | `bale_user_links`, `bale_link_codes`, `bale_inbox`, `bale_outbox`, `bale_conversations`, `bale_reminder_runs`, `bale_auth_challenges`, `bale_panel_sessions` | `bale_outbox` is a **domain-specific transactional-outbox analogue** for Bale only (deduplication_key, attempts, available_at, encrypted payload). It proves the pattern is operable on this host, but it is not a general domain-event outbox |
| Google | `google_workspace_links` | Links DAM assets/data-tables to Google files; credentials via env path/JSON |
| Laravel infra | `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` | Jobs tables exist but queue is `sync` in prod profile and **no `ShouldQueue` jobs were found** in `app/` (no `app/Jobs`, `app/Notifications`, `app/Listeners`; one event `App\Events\ContentPublished`) |

### 3.2 Identity model today (verbatim facts)

- `App\Models\User`: `role()` BelongsTo, `department()` BelongsTo, `departments()` BelongsToMany (pivot `role`,`joined_at`), `managedDepartments()`, `managedProjects()`, `projects()` BelongsToMany, `tasks()` (assignee), `activityLogs()`. `permissionKeys()` returns `[]` unless user `status=active` **and** role `is_active`; `hasRole()` compares `role.key`; `isAdmin()` = role key `admin`. (`role_key` column is documented in code as "display-only" in one place yet is written on registration/seeding and read by frontend — a dual-source-of-truth hazard the draft roadmap already flags.)
- Seeded roles are only **`admin`** (system, `*` permissions, force-synced on reseed) and **`team_member`** (`tasks.view` only); seeded users: 3 named accounts (passwords from private env). Registration defaults from config: `status=pending`, `role=team_member`, `auto_login=false` (`.env.example`: `AUTH_REGISTRATION_*`).
- Permission catalog: **78 keys** in 14 categories (`PermissionSeeder.php`), mirrored by hand in `frontend/src/config/permissions.ts`. Re-running `scripts/audit-permissions.py` during this audit produced a **diff against the committed** `docs/security/permission-inventory.csv` / `inventory-summary.json` (regenerated files were restored untouched): the committed inventory is **STALE** — it reports 74 keys and currently reports `content.workflow.manage` as backend-only with 6 keys having no backend literal reference (`assets.share`, `content.workflow.manage`, `messaging.view`, `reports.export`, `secretariat.reply_letter`, `users.view_details`).

---

## 4. Authorization and data-access surface (pre-workspace)

There is **no `app/Policies` directory** and no Laravel Gate/Policy usage for resources. Authorization is a layered patchwork that Stage 06 will have to unify:

1. **Route middleware:** `auth:sanctum` → `active-account` (`EnsureActiveAccount`: re-reads the persisted user on every request except logout; suspended users fail closed, including already-issued sessions) → `EnsureDepartmentStructure` (legacy-team rejection + consolidation gate) → `permission:*` (`EnsureUserHasPermission` → `UserPermissionGate::any`, i.e. **any-of** the listed keys).
2. **Ad-hoc domain access services** (the real record-level rules live here): `Services/Access/{UserPermissionGate,ChatAccess,AccessAdministration}`, `ContentAccess`, `ContentWatchAccess`, `SeriesAccess`, `TaskOperations::visibleTo`, `ProjectScopeAccess`, `DamAssetAccess`, `DamTableAccess`, plus Bale-side `NotificationAccess`, `Automations::authorize`, `MeetingReminders::authorize`, etc. Record visibility is therefore **inconsistent by design today**: e.g. `AnalyticsController` applies only `reports.view` and then aggregates *all* projects/tasks/contents/ideas/letters installation-wide; `GlobalSearchController` scopes tasks/contents/series via access services but projects only by the coarse `projects.view` permission; `ActivityLogController` masks task/project links by permission rather than by record membership.
3. **Unaudited-by-middleware routes:** a substantial set of authenticated routes carry **no `permission:` middleware** and rely on controller/service checks (Bale settings/account, DAM taxonomy/data-tables/library bulk ops, notifications read-all, chat attachments/realtime, settings CRUD, activity-logs, global search/analytics handled internally, all `workspace_records` CRUD, content-series reads). A route-by-route enforcement matrix does **not** exist in current form: `docs/security/route-inventory.csv` (172 lines) dates from the 2026-09-28 audit and is **STALE** vs `backend/routes/api.php` today (~185 `Route::` definitions before loop expansion over domain-record prefixes, DAM, Bale and the 5 `WorkspaceRecord` prefixes).

### 4.1 Every significant read/write path that will need workspace scoping (Stage 04/06 checklist)

For each: list / detail / create / update / delete-archive-force / **search / analytics / export / file / background / external** variants must be re-checked once workspaces exist. "Cross-workspace capable today" = today it can reach any record in the single tenant; after Stage 03/06 it must not cross a workspace boundary.

| # | Path (controller/service) | Why it is cross-boundary-critical |
|---|---|---|
| 1 | `ProjectController`, `ProjectOperationsController`, `ProjectContentPlanController`, `ProjectTemplateController`, `RestoreController` (`{module}/{id}/restore` for projects/tasks/contents) | Full CRUD + force-delete + restore by raw ID; project membership (`project_user`) is not uniformly applied as a query scope |
| 2 | `TaskController` + `Services/TaskOperations`, `TaskAutomationProcessor`, `ContentStageTaskSync`, `PlannedOccurrenceActivator`, `ActivatePlannedSeriesOccurrences` command | Task update historically allowed field-level bypass via combined PUT (see §9); automations/activators write tasks outside any request context |
| 3 | `ContentController`, `ContentSeriesController`, `ApprovalController`, `ContentWatchController` + `Content{Creator,Publication,Review,Correction,Archive,StageTaskSync,WatchNotifier}`, `ContentCodeAllocator` | Publication/approval flows create tasks and notifications across records; series batch creation is idempotency-keyed |
| 4 | `WorkspaceRecordController` (ideas, meetings, secretariat letters/resolutions, dossiers — 5 route prefixes over one table) + `MeetingActionTasks`, `MeetingNotifications` | Votes/polls/referrals/recipients live in JSON `payload`; conversions create projects/tasks; Google Meet creation attached |
| 5 | `DomainRecordController` + `Access/ChatAccess`, `ChatAttachmentController`, `ChatRealtimeController`, `CommentController` | Chat conversations/messages/notifications in `domain_records.payload` (`memberIds`, reactions, read receipts); bulk operations (`destroyBatch`-style paths) historically bypassed single-record checks |
| 6 | `DamAssetController`, `DamDataTableController`, `DamTaxonomyController` + `DamService`, `DamTableRows`, `DamFolderStorage`, `DamAssetAccess`, `DamTableAccess` | File upload/preview/download, signed temporary links (`GET public/dam/{asset}/{mode}`, signed+throttled, stateless), bulk move/update/archive, Google push/pull, quota accounting ("organization-wide" in code comments = whole installation today) |
| 7 | `DepartmentController`, `DepartmentDashboardController`, `Services/Organization/DepartmentConsolidation` | Department CRUD/member management; consolidation rewrites payload references across `contents`, `workspace_records`, `domain_records`, `system_settings`, `bale_outbox` |
| 8 | `UserController`, `RoleController`, `Services/Access/AccessAdministration` | Role assignment = privilege escalation surface (see §9 R-02) |
| 9 | `GlobalSearchController`, `AnalyticsController`, `ActivityLogController`, `IntegrityController` + `Services/IntegrityDiagnostics` | Installation-wide search/aggregates/activity feed — classic cross-workspace leak vectors |
| 10 | `SystemSettingController` + `Services/Organization/OrganizationSettings` | Global settings incl. publishing platforms, Bale enablement; no scoped (org/workspace) settings exist |
| 11 | `NotificationInboxController` + `Services/NotificationInbox`, `CommentNotifications`, `TaskAssignmentNotifications`, `OverdueNotifications` (artisan/schedule) | Inbox is derived from `domain_records`; notifications embed links/IDs into other modules |
| 12 | Bale: `Bale{Account,AssetAccess,Operations,Settings,Transport}Controller`, `app/Bot/Bale/**` (`UpdateProcessor`, `PollingRunner`, `Outbox`, `Automations`, handlers/menus, `NotificationDelivery/Access/Catalog`) | A complete second, non-HTTP data-access surface (webhook `{secret}`, panel sessions, external `tick`) that re-derives permissions per action; any workspace rule not mirrored here is a bypass |
| 13 | `GoogleWorkspaceController` + `GoogleWorkspaceService` (894 lines, largest service), `GoogleMeetService` | Push/pull of DAM content to Google; meeting creation from workspace records |
| 14 | Direct API by ID everywhere (`{project}`, `{task}`, `{content}`, `{asset}`, `{workspace_record}`, `{domain_record}`…) with implicit route-model binding | IDOR surface once a second workspace exists; currently "valid ID + coarse permission" is often sufficient |

- File access re-checks permission at download/preview (`DamAssetController::download/preview/temporaryFile`), but signed temporary links are deliberately stateless — their interaction with future workspace revocation is an open design point.
- Exports: no dedicated export framework was found; `reports.export` exists as a permission key with **no backend literal reference** — reporting export behavior is effectively the Analytics/ActivityLog JSON surface. **CONFIRMED**

---

## 5. Frontend inventory (context only — not to be refactored)

- React 19 SPA, `frontend/src` (~200 components), routes/permissions duplicated client-side (`src/config/permissions.ts`, `src/utils/permissions.ts`), Persian/Jalali-first UI, Vite build output committed to `frontend/dist` for shared-host upload. Demo mode (`VITE_DEMO_MODE`) uses in-memory `src/demo` data and blocks API calls.
- The frontend consumes the global-role model everywhere (`role_id`/`roleKey`, `departmentId` in `src/types.ts`). Any Stage 03+ contract change is a breaking API change for this SPA; per playbook rule 16 the UI is maintained by another contributor and must not be redesigned in backend stages.
- Open PR #11 (content-system review, 100 files) and draft PR #12 (design-system preview) and draft PR #13 (architecture docs) are **in flight concurrently** — merge-order/conflict risk for any migration PR. **CONFIRMED via `gh pr list`**

---

## 6. Jobs, scheduler, storage, backup, deployment (hosting constraints)

| Concern | Observed fact | Status |
|---|---|---|
| Queue | Prod profile `QUEUE_CONNECTION=sync`; zero queued jobs in code; `jobs` tables unused in practice | CONFIRMED |
| Scheduler | `routes/console.php` schedules `bale:tick` every minute and defines `content:overdue-notifications`, `contents:allocate-codes`; docs state the host has **no Cron**, and whether any external scheduler calls the secret `bot/bale/tick` endpoint on prod is unverifiable from the repo | UNKNOWN (host) |
| Long-running workers | None possible/present; Bale "runner" is request-scoped with a DB/file `RuntimeLock` | CONFIRMED |
| Storage | Local disk under `storage/app/private`; chat attachments under `chat/{conversationId}`; DAM files via `DamFolderStorage` directories; no S3 usage by default; storage quota is an app-level DAM counter, not an entitlement | CONFIRMED |
| Backup / restore | `docs/operations.md` explicitly: capability, destination, retention, RPO/RTO all undecided; **no restore rehearsal evidence in repo**; manual SQL patch files under `docs/deployment/*.mysql.sql` suggest host DB changes have historically been applied via cPanel/phpMyAdmin-style execution | UNKNOWN — **blocking for Stage 04/10** |
| Deployment workflow | Manual coordinated upload: build frontend on dev/CI → upload whole `frontend/dist`; backend document root = `backend/public` only; delete generated `bootstrap/cache/*.php` via File Manager; no public artisan endpoint; "installation_incomplete" guard (`OperationsSchema::MESSAGE`) exists for partially-applied Bale schema | CONFIRMED (as documented; host execution UNKNOWN) |
| DB change application on prod | Mixed history: Laravel migrations + hand-run `.mysql.sql` files; `TEST_GUIDE.md` instructs running a specific migration on the server manually | CONFIRMED — migration provenance on prod is **UNKNOWN** |

---

## 7. CI and quality gates

- Single workflow `.github/workflows/quality.yml` on PRs and pushes to `main`/`arena/**`: frontend job (Node 22: `npm ci`, lint=typecheck=`tsc --noEmit`, `npm test`, production `vite build`, uploads `frontend/dist` artifact with `release-metadata.txt`) and backend job (PHP 8.4 + sqlite: `composer validate --strict`, `composer install`, **`migrate:fresh` gate on a clean SQLite DB**, `phpunit` on in-memory SQLite).
- Gates that exist: typecheck, frontend tests, frontend build, composer contract, fresh-migration, PHPUnit. Gates that do **not** exist: PHP static analysis (no PHPStan/Psalm config found), PHP lint/format enforcement in CI (Pint is a dev dependency only), MySQL migration test, E2E in CI (Playwright is configured for local/mock use per `docs/deployment.md`), coverage thresholds. **CONFIRMED**

---

## 8. Test baseline (actual runs, this audit)

| Check | Command / evidence | Result |
|---|---|---|
| Frontend unit/regression | `cd frontend && npm test` (node --test, `tests/*.mjs`) — run locally 2026-10-15 after `npm ci` | **PASS — 140/140, 0 fail** |
| Frontend typecheck/lint | `npm run lint` and `npm run typecheck` (both `tsc --noEmit`) — run locally | **PASS** |
| Frontend production build | **NOT RUN locally** — building would overwrite the tracked `frontend/dist` release artifact, out of scope for a read-only stage. CI performs this build (below) | NOT RUN (local) / PASS (CI) |
| Backend PHPUnit | **NOT RUN locally** — `php` and `composer` are not installed in this sandbox (`php: command not found`). 428 test methods exist statically (`backend/tests`: 40 Feature/Unit files incl. `AccessControlHardeningTest` 41, Bale suite, DAM, content-series, department-consolidation) | NOT RUN (local) |
| Backend CI (exact HEAD `b30bfef…`) | GitHub Actions run `38242087918` — jobs "Backend contracts and tests" and "Frontend typecheck, tests and artifact" | **PASS (both jobs, conclusion: success)** — https://github.com/nmahdin/main-tadbir/actions/runs/38242087918 |
| Backend test *count* in CI | Attempted `gh run view 38242087918 --log` to extract PHPUnit totals; log download failed (EOF from results host). The executed test/assertion count is therefore **not quoted** — only job conclusions are evidenced | UNKNOWN (count) |
| Migration fresh-install | Covered by CI backend job (`migrate:fresh` on clean SQLite) at HEAD | PASS (SQLite only; **MySQL fresh/upgrade NOT evidenced**) |
| Migration upgrade path (existing data) | Only SQLite-oriented tests (`PhaseOneSqliteMigrationTest`, department-consolidation and payload-rewrite migration tests). No MySQL upgrade test, no sanitized production-clone test in repo | NOT RUN / UNKNOWN |
| Playwright E2E | Configured; docs state browser tests use mocked APIs and were run with an externally-installed Chromium in a past sandbox. Not run in this audit | NOT RUN |
| PR #13 (draft docs) CI | `gh pr checks 13`: backend + frontend jobs pass — expected, it changes only 2 markdown files | PASS (docs-only) |

Historical note: `gh run list --branch main` shows multiple older `failure`/`cancelled` Quality-gates runs (e.g. around PRs #6/#7 and env-file changes). The baseline claim is therefore: **HEAD is green; the branch history is not uniformly green.**

No Playwright, MySQL, or host test was performed. No test was "fixed" to pass; nothing was modified to obtain these results (the one incidental write — re-running `scripts/audit-permissions.py` — regenerated two inventory files, which were immediately restored byte-for-byte with `git checkout --`; final `git status` shows only this new report).

---

## 9. Conflicts with the playbook and the draft architecture documents

| ID | Conflict / gap | Evidence | Severity |
|---|---|---|---|
| C1 | **Source-of-truth documents are not on the target branch.** Playbook §0 names `docs/architecture/core.md` + `docs/roadmap/migration-to-tadbir-comprehensive.md` as required reading and possible unmerged drafts — verified: absent on `main`, present only in draft PR #13. They cannot be treated as "approved architecture" yet | `ls docs/architecture/` (only `chat-and-comments.md`, `smart-tasks-review-and-plan.md`); `gh pr view 13` | **Blocker for Stage 01 entry** — Stage 01 must start with a docs-only import/reconciliation decision |
| C2 | **Departments: hierarchy exists, target says flat.** Current `departments.parent_id` + `children()` + frontend `departmentHierarchy.ts` implement nesting; playbook rule 8 and draft core §2 both mandate flat v1. Also `teams`/`team_user` still exist physically despite "no team entity" | `Department.php`, migration `2026_09_13_000003`, `DepartmentConsolidation` | High — Stage 01 must decide: keep-but-unused `parent_id`, or formally deprecate; Stage 04 mapping must state what happens to nested rows and `legacy_team_id` |
| C3 | **Terminology collision: "workspace" already means three other things** — `workspace_records` (idea/meeting/letter/resolution/dossier store), frontend `components/workspace/*` (ActionDashboard/ApprovalCenter/…), `GoogleWorkspaceLink`, plus the playbook's `Workspace`. The draft core doc does not mention this collision | `WorkspaceRecord.php`, `frontend/src/api/workspaceRecords.ts`, `frontend/src/components/workspace/` | High — naming ADR required in Stage 01 before any `workspaces` table lands; renaming legacy concepts is itself a breaking change and may be deferred with an explicit alias policy |
| C4 | **Role model is global and duplicated.** Target: exactly one active role *per workspace membership*, protected "Workspace Manager"/"Member". Current: one global `users.role_id` (+ `role_key` shadow), seeded `admin`/`team_member`, *plus* a third role source: `department_user.pivot.role` string. Draft roadmap §5 already maps `role_id/role_key → membership role` "by behavior, not by name" — consistent with playbook, but unratified | `User.php`, `RoleSeeder`, `users` migration, `department_user` pivot | High — Stage 01 ADR + Stage 05 transitional source-of-truth policy (playbook already requires this) |
| C5 | **"Organization" naming already used for the single tenant.** `Services/Organization/{OrganizationSettings,DepartmentConsolidation}`, code comments ("organization-wide aggregates", DAM quota "organization-wide") all mean *the whole current installation*. Playbook `Organization` is a tenant entity below platform and above workspace | `AnalyticsController`, `DamAssetController:193`, `app/Services/Organization/` | Medium — mostly a comprehension hazard; Stage 04 must decide whether the legacy installation maps to one Organization (presumably) and state it explicitly rather than letting readers infer it |
| C6 | **Subscription/entitlement concepts are entirely absent** (no plans, subscriptions, feature registry, module activation). This is *consistent* with the playbook (Stage 07 builds it) but note the draft core §7 already prescribes behaviors (e.g. post-expiry read/export continuation) while the playbook §13 declares subscription status semantics an **OPEN DESIGN ITEM — never invent**. Where draft-core prose reads as decided, the playbook's "open" wins until Stage 01 ratifies | draft `core.md` §7 vs playbook rules 11–13 | Medium — Stage 01 decisions register must classify each such statement CONFIRMED / ASSUMPTION / OPEN |
| C7 | **Roadmap phase order ≠ playbook stage order.** Draft roadmap "Phase 2" creates core tables *and* assigns existing data to workspaces in one phase; the playbook separates additive foundation (Stage 03, explicitly: "Do not assign existing records to arbitrary workspaces") from mapping/backfill (Stage 04, dry-run + exception register). Not contradictory in spirit, but the draft's combined phase must not be executed as written | draft `migration-to-tadbir-comprehensive.md` §4 Phase 2 vs playbook Stages 03–04 | Medium — reconcile in Stage 01; playbook stage order is the safer, governing sequence |
| C8 | **Security audit backlog predates workspace work.** `docs/security/access-control-review.md` (2026-09-28) recorded 16 acceptance tests with 14 failing against the then-current code; `access-control-phase1.md` reports phase-1 fixes (active-account middleware, permission hardening are visible in current code), but the audit file itself warns its inventories are pre-fix and "must not be assumed current". Which of A01–A16 are closed at HEAD was **not re-verified** in this read-only stage (backend tests not run locally; `backend/audits/AccessControlAuditTest.php` referenced by the doc does not exist in the tree — only `tests/Feature/AccessControlHardeningTest.php`) | `docs/security/*.md`, absence of `backend/audits/` | High — Stage 01/06 must re-baseline the A01–A16 matrix at HEAD before layering workspace isolation on top; otherwise pre-existing IDOR/privilege issues will be misattributed to (or masked by) the migration |
| C9 | **Phase documents claim progress that CI history contradicts in places.** `docs/phase-*-audit.md`, `phase-completion-status.md`, `deployment.md` contain per-phase "delivered/verified" claims, PHP-WASM test totals (e.g. "263 tests / 1555 assertions") and host instructions from earlier checkouts (one cites a different HEAD, `aefe1af7`). They are useful history, not a current baseline | `docs/phase-*.md`, `docs/deployment.md` rollback section | Medium — trust only this audit's §8 for the current baseline; treat phase docs as STALE until re-verified |
| C10 | **Engine-specific constraint strategy is undecided for XOR ownership.** Playbook Stage 03 wants `owner_user_id XOR organization_id` enforced in DB "where supported". Current codebase already carries divergent MySQL-ENUM vs SQLite-CHECK migrations; MySQL CHECK constraints exist (8.0.16+) but the *production MySQL version is UNKNOWN*, and Laravel schema-builder CHECK support differs by engine | Migrations `2026_09_28_000001`, `2026_09_29_000001`, `2026_10_01_000007` | Medium — Stage 01 ADR must record the actual prod engine/version before Stage 03 promises DB-level XOR |
| C11 | No conflict, noted for completeness: draft core §5/§8 (module contracts, conceptual table list, outbox caution) and playbook rules 4–7, 15–16 are mutually consistent and consistent with the observed code (modular monolith, no cross-module table writes as an *aspiration* — though today services freely query/write across module tables, e.g. conversions creating tasks/projects from workspace records; that is current-state debt, not a doc conflict) | draft `core.md` §§5,8; `WorkspaceRecordController`, `MeetingActionTasks` | Info |

---

## 10. Risk register (ranked)

| ID | Risk | Severity | Basis / mitigation entry point |
|---|---|---|---|
| R-01 | **Ambiguous legacy ownership.** No record in any operational table carries a workspace/organization identifier, and generic stores (`workspace_records`, `domain_records`, `contents.payload`) hide relationships in JSON. A large fraction of Stage 04 records will likely be *non-deterministically* attributable → quarantine volume could be large | **Critical** | Stage 04 dry-run + exception register; never guess (playbook safeguard). Decide the C5 single-Organization mapping early |
| R-02 | **Privilege-escalation surface in user/role administration** (global role assignment via user create/update; documented historically in A10; current mitigations at HEAD unverified — C8). Workspace membership work (Stage 05) built on an unverified base compounds this | **Critical** | Re-run/rebuild the A01–A16 acceptance matrix at HEAD before Stage 05; grant-ceiling rule from draft core §3 must be ratified in Stage 01 |
| R-03 | **Second access surface: Bale bot + scheduled/artisan + Google sync** bypass any HTTP-only isolation. If Stage 06 scopes only controllers, bot menus/notifications/outbox remain cross-workspace | **Critical** | Include `app/Bot/Bale/**`, console commands and `GoogleWorkspaceService` in the Stage 06 slice definition and adversarial tests |
| R-04 | **Production DB parity unknown.** Manual `.mysql.sql` patches + "run this migration on the server" instructions mean prod schema may not equal `migrate:fresh` output; MySQL ENUM migrations are untested in CI | **High** | Before Stage 03: obtain (privately, outside Git) `SHOW CREATE TABLE`/migration-status evidence from the host; add MySQL CI job or disposable-MySQL migration test |
| R-05 | **No proven backup/restore.** Every later stage's rollback story depends on it; docs explicitly mark it undecided | **High** | Human/host task before Stage 04; restore rehearsal is a Stage 10 gate but the *capability* must be proven far earlier |
| R-06 | **Department consolidation gate state on prod unknown.** If consolidation is mid-phase on the host, department semantics (and any Stage 04 department mapping) differ per environment; its `down()` is intentionally irreversible | **High** | Verify gate phase on host (private); Stage 01 decides flat-department + legacy-team disposition (C2) |
| R-07 | **Tracked `vendor/` + `dist/` artifacts** make every PR diff huge and review of migration PRs error-prone; also a stale-artifact risk if a PR forgets to rebuild `dist` | **Medium** | Explicitly out of scope for migration stages unless separately approved; rely on CI artifact job as source of truth |
| R-08 | **Concurrent open work:** PR #11 (100 files, content system), draft #12 (design system), draft #13 (architecture docs). Migration PRs rebased across these will conflict, esp. permission catalogs duplicated in PHP + TS | **Medium** | Sequence Stage 01 docs PR first; keep later stages narrowly scoped per playbook |
| R-09 | **Scheduler/queue assumptions.** Any Stage 08 outbox/queue design that assumes cron/workers will silently not run on this host (Bale tick pattern — secret HTTP endpoint + idempotent commands — is the proven operable pattern) | **Medium** | Stage 08 must re-verify host capabilities; default to sync + externally-triggered idempotent ticks |
| R-10 | **JSON-payload integrity.** Votes, chat membership, referrals, DAM grants have no FK/unique enforcement; workspace attribution and membership reconstruction from payloads can be inconsistent (duplicates, dangling user IDs after `nullOnDelete`) | **Medium** | Stage 04 schema-mapping must include payload-forensics counts, not just column mapping |
| R-11 | **Signed DAM temporary links** are stateless; workspace membership revocation will not retract already-issued links (expiry is the only bound — TTL not verified in this audit) | **Low/Medium** | Record as a Stage 06/08 design question; verify TTL in code at that stage |
| R-12 | Frontend/backend permission catalog duplication (78 keys, two hand-maintained sources, one already drifted per §3.2) will drift again when workspace permissions are added | **Low** | Stage 02 quality-gate candidate: single-source generation or a parity test (frontend `permissions.test.mjs` partially covers today) |

---

## 11. What was NOT done (explicit)

- No application code, migration, schema, seed, config, frontend, or CI file was modified. No branch was created (audit-only, per playbook Stage 00 + standard wrapper). No PR opened, nothing merged, nothing deployed.
- No production system, host control panel, or real database was accessed; no real user data, credentials, or `.env` values were read (only tracked `*.example` profiles).
- Backend PHPUnit, Playwright, and any MySQL test were **NOT RUN** (reasons in §8) — they are not claimed as passing beyond the cited CI job conclusions for the exact HEAD commit.
- Stage 01 (architecture contracts/ADRs) was **not** started. The draft PR #13 documents were read read-only via the GitHub API; PR #13 was not edited, approved, or merged.

## 12. Acceptance checklist — Stage 00

- [x] Laravel/PHP/React/dependency versions inventoried (§2)
- [x] Database engine(s) identified; production engine flagged partially UNKNOWN (§2, §6)
- [x] All 56 migrations / 57 created tables inventoried and grouped (§3)
- [x] User/role/department fields and legacy team structures mapped (§3.2, C2/C4)
- [x] All significant operational tables listed with workspace-scoping notes (§3.1)
- [x] Every route/service class capable of cross-boundary read/write enumerated (§4.1, 14 paths incl. search, analytics, files, Bale, background, Google)
- [x] Auth, middleware, permission and record-access layers documented (§4)
- [x] Jobs/queues/scheduler/storage constraints documented; scheduler/backup host facts flagged UNKNOWN (§6)
- [x] CI workflow and quality gates inventoried; missing gates noted (§7)
- [x] Actual test baseline recorded with PASS / NOT RUN and evidence links (§8)
- [x] Conflicts with existing architecture documents itemized (§9, C1–C11)
- [x] Risks ranked by severity (§10)
- [ ] Production MySQL version/schema parity — **UNKNOWN, requires human with host access**
- [ ] Backup/restore capability and rehearsal — **UNKNOWN, requires human with host access**
- [ ] Department-consolidation gate phase on production — **UNKNOWN, requires human with host access**

**STOP — Stage 00 complete. Awaiting human approval. Do not proceed.**
