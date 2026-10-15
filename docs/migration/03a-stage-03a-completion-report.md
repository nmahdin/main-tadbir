# TADBIR Migration — Stage 03A Completion Report (Core Organization, Workspace, Membership Foundation)

- **Stage:** 03A only · **Status:** NEEDS REVIEW · **Baseline:** `3adf374` · Branch: `arena/582a70e5-main-tadbir` (Arena limitation)
- **Not done (by design):** Stage 03B workspace RBAC, subscriptions/entitlements, legacy role/department/team deletion, any DB reset, production connection, frontend changes, merges.

## 1. Implementation
| Area | Files |
|---|---|
| Migration (additive) | `backend/database/migrations/2026_10_15_000001_create_organizations_workspaces_memberships.php` — `organizations`, `workspaces`, `organization_memberships`, `workspace_memberships` |
| Core models | `app/Core/Organizations/{Organization,OrganizationMembership,OrganizationProvisioner}.php`, `app/Core/Workspaces/{Workspace,WorkspaceMembership,WorkspaceAccess,PersonalWorkspaceProvisioner}.php`, `app/Core/Memberships/{MembershipStatus,MembershipLifecycle}.php` |
| Thin HTTP (additive) | `app/Http/Controllers/Api/V1/Core/{OrganizationController,WorkspaceController}.php` + 6 routes under `/api/v1/core/…` inside the existing auth/active-account group. No legacy route changed |
| Factories | `OrganizationFactory`, `WorkspaceFactory` (personal/organizational/default states), `OrganizationMembershipFactory`, `WorkspaceMembershipFactory` (deactivated/ended states) |
| Seeder | `CoreWorkspaceSeeder` (opt-in, **not** wired into `DatabaseSeeder`): idempotently ensures a default personal workspace per active user |
| Tests | `tests/Feature/Core/CoreFoundationTest.php` — 12 tests (below) |
| CI | `.github/workflows/quality.yml`: new MySQL 8.0 `migrate:fresh` job (evidence §3) |

## 2. Rules implemented
- **Exactly one owner:** model-level XOR validation on every `Workspace` save (DomainException on both/neither); slug unique; owner FKs `restrictOnDelete`.
- **Defaults:** `PersonalWorkspaceProvisioner::ensureDefault` idempotent and duplicate-safe; organization creation (org + default workspace + creator org-membership + creator *explicit* workspace-membership) in one transaction, rollback proven by test.
- **Independent memberships:** organization membership alone grants no workspace access — proven by an API 403 test; deactivating org membership blocks organizational-workspace visibility even with an active workspace membership.
- **Lifecycle:** `active → deactivated → active (reactivation, clears deactivated_at)`, `→ ended` from either; `ended` is terminal and rejoining creates a **new** membership record (unique live-membership constraint makes this safe). Arbitrary transitions throw.
- **Foundation visibility only:** `WorkspaceAccess` answers "may open this workspace" — it is explicitly not the Stage 04 authorization decision and exposes no operational data.
- Legacy global roles/permissions untouched (`test_legacy_global_role_behavior_is_unchanged`); no `role_id` on memberships (that's 03B).

## 3. SQLite / MySQL constraint evidence (Requirement 9)
| Rule | SQLite | MySQL 8 |
|---|---|---|
| XOR single owner | Model + tests. **Not DB-enforced**: SQLite cannot add a CHECK via ALTER and the table is not rebuilt — *documented non-equivalence*; the durable fix (table rebuild in a fresh-schema stage) is recorded for the Stage 03B/04 schema pass | `CHECK ((owner_user_id IS NOT NULL) + (organization_id IS NOT NULL) = 1)` in migration |
| One default workspace per owner | Generated discriminator column + unique index (`default_personal_owner_id`, `default_organization_id`) — DB-enforced, test-proven | Same generated-column technique (MySQL lacks partial indexes) |
| One live membership per (scope, user) | Generated `live_user_id` (null when `ended`) + unique index — DB-enforced, test-proven | Same — but see the FK note below |
| FK integrity | `DB_FOREIGN_KEYS=true` local profile; restrictive owner FKs | **Non-equivalence found by CI:** InnoDB cannot combine a generated column that reads `user_id` with `ON DELETE CASCADE` on that column — error 1215 in both statement orders (runs `38708563927`, `38709463688`). Membership `user_id` FKs are therefore `RESTRICT` on both engines (memberships are ended explicitly through the lifecycle, never silently removed by deleting a user — arguably the more correct lifecycle semantics); organization/workspace FKs remain `CASCADE`. |
| Migration execution | Whole PHPUnit suite on SQLite (CI backend job, incl. fresh-migration gate) | New CI job runs `migrate:fresh` against a **MySQL 8.0 service** — green in run `38709695474` (all three jobs). MariaDB was NOT tested. Production MySQL version remains UNKNOWN (Q-02) — constraint code branches on driver, and MySQL < 8.0.16 would ignore CHECK (domain validation remains the guarantee there) |

## 4. Test evidence (actual runs)
- PHP syntax of every new PHP file: validated with a PHP parser in-sandbox. Backend PHPUnit **NOT RUN locally** (no PHP binary in this sandbox) — execution evidence is CI (§3/§5 of the stage's final message).
- Frontend: untouched; its suites run in CI as usual.

## 5. Risks / rollback
Additive schema + additive routes only; rollback = revert the Stage 03A commits (migration `down()` drops only the four new tables). Residual risks: (a) generated-column syntax verified on SQLite + MySQL 8 CI, not on the production host's actual MySQL/MariaDB version (Q-02); (b) membership admin APIs (invite/assign/deactivate by managers) intentionally deferred — lifecycle is domain-level only in 03A; (c) no workspace role yet (03B) so the new endpoints authorize visibility only.

## 6. Acceptance checklist — Stage 03A
- [x] Core models/migrations under `App\Core\…`, thin controllers, provisioners own business rules
- [x] XOR ownership, one default personal + one default organizational workspace, atomic org creation
- [x] Independent memberships; org membership alone grants nothing (test-proven)
- [x] Lifecycle active/deactivated/ended with explicit reactivation + rejoin rules (tests)
- [x] Factories + opt-in seeder; legacy role/permission implementation fully operational (regression test)
- [x] No legacy structures deleted, no subscriptions/entitlements, no resets, no frontend/design changes
- [x] SQLite suite + MySQL migration evidence gathered via CI (actual, watched)
- [ ] Human approval before Stage 03B

STOP — Stage 03A complete. Awaiting human approval. Do not proceed.
