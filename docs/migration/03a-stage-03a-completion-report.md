# TADBIR Migration — Stage 03A Completion Report (Core Organization, Workspace, Membership Foundation)

- **Stage:** 03A only · **Status:** NEEDS REVIEW (conditional-approval authorization correction applied, §7) · **Baseline:** `3adf374` · Branch: `arena/582a70e5-main-tadbir` (Arena limitation)
- **Not done (by design):** Stage 03B workspace RBAC, subscriptions/entitlements, legacy role/department/team deletion, any DB reset, production connection, frontend changes, merges.

## 1. Implementation
| Area | Files |
|---|---|
| Migration (additive) | `backend/database/migrations/2026_10_15_000001_create_organizations_workspaces_memberships.php` — `organizations`, `workspaces`, `organization_memberships`, `workspace_memberships` |
| Core models | `app/Core/Organizations/{Organization,OrganizationMembership,OrganizationProvisioner}.php`, `app/Core/Workspaces/{Workspace,WorkspaceMembership,WorkspaceAccess,PersonalWorkspaceProvisioner}.php`, `app/Core/Memberships/{MembershipStatus,MembershipLifecycle}.php` |
| Thin HTTP (additive) | `app/Http/Controllers/Api/V1/Core/{OrganizationController,WorkspaceController}.php` + 6 routes under `/api/v1/core/…` inside the existing auth/active-account group. No legacy route changed |
| Factories | `OrganizationFactory`, `WorkspaceFactory` (personal/organizational/default states), `OrganizationMembershipFactory`, `WorkspaceMembershipFactory` (deactivated/ended states) |
| Seeder | `CoreWorkspaceSeeder` (opt-in, **not** wired into `DatabaseSeeder`): idempotently ensures a default personal workspace per active user |
| Tests | `tests/Feature/Core/CoreFoundationTest.php` — 14 tests (12 original + 2 authorization-correction negatives, §7) |
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
- [ ] Human final approval before Stage 03B (conditional-approval correction in §7 awaits final review)

## 7. Conditional-approval correction — authorization of Core API responses (2026-10-15)

**Finding (human review):** `OrganizationController::index` (`with('workspaces')`), `show` and `store` (`load('workspaces')`) embedded **every** workspace of an organization in organization responses. Any ordinary organization member could therefore enumerate workspace metadata for workspaces they hold no workspace membership in — contradicting the independence rule of §2 and inventing a de-facto organization-wide visibility that no approved decision grants.

**Correction (commits `66d3cfd`, fixture fix `0096623`):**
- Organization `index`/`show`/`store` now return organization-level information only; no workspace collection is loaded or serialized. Workspace data remains available solely through `WorkspaceController`, where `WorkspaceAccess` decides visibility workspace by workspace. No organization-administrator privilege was invented (that is Stage 03B territory, untouched).
- **Review of all other new Core responses (no similar disclosure found):** `WorkspaceController::index` is query-scoped to owned/actively-member workspaces and then filtered through `WorkspaceAccess`; `show` aborts 403 unless `canAccess`; `store` returns only the caller's own workspace. No other Core endpoints exist. As defense-in-depth, the workspace generated discriminator columns (`default_personal_owner_id`, `default_organization_id` — internal unique-index machinery) are now hidden from serialization on the `Workspace` model.
- **Negative tests added (2):** an organization-only member cannot enumerate the default or an extra organizational workspace through the organization index/show payloads (missing `workspaces` key, workspace names absent) nor through the workspace index, an outsider still receives 403 on `show`, and the creation response embeds no workspace collection while the creator still reaches the provisioned workspace through the visibility-checked endpoint. One test-fixture defect was found and fixed during CI verification (the provisioner names the default workspace after the organization, so the fixture renames it before the absence assertions; CI run `38711126084`).
- **SQLite XOR parity (§3) remains a documented follow-up only.** No destructive schema rewrite (table rebuild) was performed as part of this correction, per instruction; the model-level XOR + tests remain the SQLite guarantee until a future fresh-schema pass.
- **Evidence:** full CI green on the corrected head — push run `38711327094` (Backend incl. PHPUnit 453 tests on SQLite, MySQL 8.0 migration gate, Frontend) and the corresponding pull-request run; final docs-head run referenced in the stage's closing message. No database reset, no legacy deletion, no frontend change, no Stage 03B work.

STOP — Stage 03A correction complete. Awaiting final human approval. Do not proceed.
