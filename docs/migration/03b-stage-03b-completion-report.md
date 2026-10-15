# TADBIR Migration — Stage 03B Completion Report (Organization and Workspace-Scoped RBAC Foundation)

- **Stage:** 03B only · **Status:** NEEDS REVIEW · **Baseline:** Stage 03A approval `96d0a8e` · Branch: `arena/582a70e5-main-tadbir` (Arena limitation)
- **Not done (by design):** Stage 04 central-authorization cutover, switching any business module (Projects, Tasks, Content, DAM, Search, Analytics, Bale, Google), legacy role/department/team deletion, subscriptions/billing, production connection, merges, frontend/Design System changes.

## 1. Implementation

| Area | Files |
|---|---|
| Migration (additive) | `backend/database/migrations/2026_10_15_000002_create_scoped_rbac_tables.php` — `core_permissions`, `core_roles`, `core_role_permissions`, nullable `role_id` on both membership tables |
| Permission catalog | `app/Core/Rbac/PermissionCatalog.php` — the single canonical key registry (14 foundation keys: 8 organization-scope, 6 workspace-scope). `core_permissions` is its database mirror via `PermissionCatalog::sync()`, never a second writable catalog |
| Models | `app/Core/Rbac/{ScopedRole,ScopedPermission}.php`; `role_id` + `role()` added to `OrganizationMembership`/`WorkspaceMembership` |
| Domain services | `RoleProvisioner` (protected defaults), `WorkspaceRoleService` (assignment + custom workspace roles), `OrganizationRoleService` (assignment), `MembershipPermissions` (single effective-permission resolver), `FinalManagerGuard`, `GrantCeiling`, `RbacAuthorizationException` (403) / `RbacValidationException` (422) |
| Provisioning integration | `OrganizationProvisioner` and `PersonalWorkspaceProvisioner` now attach roles inside their existing transactions; `WorkspaceController::store` delegates additional-workspace creation to the provisioner so the owner always gets a membership + Workspace Manager role |
| Thin HTTP (additive) | `OrganizationRoleController`, `WorkspaceRoleController` + 7 routes under `/api/v1/core/…` (list roles, create/update/delete custom workspace roles, assign membership roles). Controllers contain no rule logic |
| Factories/seeders | `ScopedRoleFactory`, `ScopedPermissionFactory`; membership factories default live memberships to the member role (ended: none); opt-in `CoreRbacSeeder` (catalog sync, protected defaults for existing containers, conservative role backfill) — **not** wired into `DatabaseSeeder` |
| Tests | `tests/Feature/Core/CoreRbacTest.php` — 17 tests (§4); all 14 Stage 03A tests unchanged and passing |

## 2. Rules implemented (ADR-0004, ADR-0003, ADR-0009)

- **Scope separation:** organization keys govern only the management plane; workspace keys only one workspace's operational plane. A role's scope must match its container (`organization_id` XOR `workspace_id`, model + DB unique discriminator + MySQL CHECK). Cross-workspace, cross-organization, and cross-scope assignments are rejected by the assignment services before any write.
- **Exactly one role:** every ACTIVE membership holds exactly one role — enforced by the assignment/provisioning services, the factories' defaults, and `MembershipPermissions` defensively returning no permissions for a role whose scope/container does not match the membership's container. Ending a membership clears its role, so rejoining (a new record, Stage 03A) never silently restores a previous role.
- **Protected defaults:** per workspace **Workspace Manager** (all workspace keys) and **Member** (`workspace.view`); per organization **Organization Manager** (all organization keys) and **Organization Member** (`organization.view`). Protected roles cannot be edited, deleted, or shadowed by a custom role reusing their keys; provisioning is idempotent.
- **Grant ceiling:** role creation, permission updates, and assignments all require the granted permission set to be a subset of the actor's own effective permissions in that scope (plus `*.roles.manage`). Unknown keys and wrong-scope keys throw `RbacValidationException` (HTTP 422) — never silently dropped.
- **Creator authority without data access:** the organization creator receives Organization Manager (initial management authority) and — explicitly through workspace membership — Workspace Manager of the default organizational workspace. An organization manager *without* workspace membership has zero workspace permissions (resolver + API 403 test-proven); organization roles never create workspace memberships implicitly.
- **Final-manager protection:** demoting, deactivating, or ending the final active Organization Manager / Workspace Manager is refused in both the assignment services and the membership lifecycle itself, inside transactions with row locks; repeated/concurrent-style assignments are safe (single `role_id`, locked re-read).
- **Inactive memberships exercise nothing:** deactivated/ended memberships resolve to zero permissions; deactivating an organization membership immediately blocks that organization's workspace permissions even with an active workspace membership and role (Stage 03A independence rules preserved).
- **Custom organization roles are deferred** (role templates are a later slice, ADR-0004 §7 / Q-06): organization assignment uses the protected defaults in this stage. **Platform-scope roles/keys are absent** — platform-admin powers are OPEN (Q-10) and were not invented.

## 3. Deferred identity cutover (no legacy identity change in this stage)

Per ADR-0004 §5 the legacy identity fields remain **intact and authoritative for all unmigrated code**: `users.role_id`, `users.role_key`, `users.department_id`, `department_user.role`, and the legacy `roles`/`permissions`/`permission_role` tables with their 78-key catalog and frontend mirror. Nothing in Stage 03B reads or writes them, and no business module was switched to the scoped resolver — so there is exactly one writable source of truth per decision: legacy decisions still flow through the legacy implementation, scoped decisions (only the new Core endpoints) through Core RBAC. Deleting the legacy fields is reserved for the **tested Stage 04 authorization cutover**, when workspace RBAC and every dependent path (auth, user administration, Bale surface, frontend catalog parity) are migrated and green. Until then coexistence is read-only legacy and time-boxed to that cutover; this stage deliberately accepts the temporary dual-system state rather than a risky dual-write.

## 4. Test evidence (actual runs)

- Backend PHPUnit (SQLite, CI job "Backend contracts and tests"): **470 tests green** on the final head, including the 17 new RBAC tests: creator authority, protected-default idempotency + DB key uniqueness, model scope/container mismatch, cross-workspace denial, cross-scope/cross-organization denial, unknown/cross-scope key rejection (service + API 422), unauthorized actor (service + API 403), grant-ceiling escalation (create + assign), final-manager protection (demote/deactivate/end, both scopes), inactive-membership denial, deactivated-organization blocking, organization-manager-without-workspace-membership denial (resolver + API), protected-role invariants, repeated-assignment single-role semantics, role-administration API, factory invariants.
- Migration gates: SQLite fresh-migration gate and the **MySQL 8.0 `migrate:fresh` job** both green (§5). Frontend suite/typecheck/build green in the same runs; frontend code untouched.
- Local sandbox has no PHP binary: PHP files were parser-validated locally; execution evidence is CI-only, as in previous stages. One CI iteration failed on a test-side stale-instance assertion (run `38713568370`, 469/470) and was fixed without weakening the assertion (`0096623`-style fixture correction inside the fix commit).

## 5. SQLite / MySQL constraint parity

| Rule | SQLite | MySQL 8.0 |
|---|---|---|
| Role key unique per scope owner | Generated `scope_owner_id` discriminator + unique index (`core_roles_scope_owner_key_unique`) — test-proven | Same technique (reserved word `key` backtick-quoted; found by CI run `38712966798`) |
| Role scope ↔ container match | `ScopedRole` model validation + tests | Model + `CHECK` constraint in migration |
| Permission scope values | Model/catalog validation | Model/catalog + `CHECK (scope IN ('organization','workspace'))` |
| One role per membership | Single `role_id` column (structural) + services | Same |
| Membership user/role references | `restrictOnDelete` (unchanged Stage 03A semantics) | Same |

**Remaining documented non-equivalence (follow-up, not corrected here):** the Stage 03A workspace XOR and this stage's scope-container match are model-enforced on SQLite because SQLite cannot add a CHECK via ALTER; correcting them requires a table rebuild. That rebuild is *not* an additive change and was explicitly kept out of this stage (Stage 03A correction instruction: no destructive schema rewrite). Recorded follow-up: perform the rebuild in a future fresh-schema pass (Stage 04 schema work), after which SQLite reaches constraint parity with MySQL. Domain validation + tests remain the SQLite guarantee until then. MariaDB and the production MySQL version remain untested/UNKNOWN (Q-02).

## 6. Acceptance checklist — Stage 03B

- [x] Scoped RBAC domain model + additive migrations under `App\Core\Rbac`; thin controllers; rules in domain services only
- [x] Organization management permissions separated from workspace operational permissions; catalog ownership documented (§1–2)
- [x] Protected Workspace Manager/Member (+ organization defaults); custom workspace roles under ceiling and protected-role invariants
- [x] Creator = initial organization manager; default organizational workspace gets its initial Workspace Manager explicitly via membership
- [x] Final-manager protection (demote/deactivate/end), unknown-key and scope-mismatch rejection, inactive-membership denial
- [x] Factories, opt-in seeder, SQLite + MySQL 8.0 migration evidence, full backend + frontend CI green
- [x] Legacy identity/roles/departments/teams untouched; deferred cutover documented (§3); no module switched; no second writable catalog
- [ ] Human approval before Stage 04

STOP — Stage 03B complete. Awaiting human review. Do not proceed.
