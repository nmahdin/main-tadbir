# ADR-0004 — Workspace-Scoped RBAC and Legacy Role Replacement
**Status:** ACCEPTED* (target direction, 2026-10-15; removal timing per corrected decision §5)

## Context (CONFIRMED)
Authorization today: `users.role_id` FK **plus** denormalized `users.role_key` (dual source; code calls the key "display-only" yet registration/seeding write it), a 78-key global permission catalog duplicated by hand in `frontend/src/config/permissions.ts` (already drifted: committed inventory reports 74), seeded roles `admin` (all permissions, force-synced) and `team_member` (tasks.view), and a third role source: free-text `department_user.pivot.role`. Stage 00 C4; security audit A10/A11/A16 history (see security matrix).

## Decision (PROPOSED)
1. Roles are **scoped**: `platform`, `organization`, `workspace`. A role is assignable only within its scope. `roles`/`permissions`/`permission_role` keep their names but contracts change; permission keys remain stable dotted strings.
2. A workspace membership holds **exactly one active role**. Each workspace is seeded with two protected roles — **Workspace Manager** and **Member** — plus optional custom roles creatable by Workspace Managers within their workspace.
3. Platform roles (system administrator etc.) are explicit and never confer workspace data access by themselves (ADR-0003).
4. **Grant ceiling:** an actor may only assign roles/permissions they themselves effectively hold in that scope; unknown permission keys are rejected with 422, never silently dropped (legacy bug pattern, CONFIRMED in old `RoleController` audit finding).
5. **Replacement, not migration (revised strategy):** `users.role_id`, `users.role_key`, `users.department_id`, `department_user.role` are **deleted at the tested Stage 04 authorization cutover** — only when workspace RBAC and every dependent code path (auth, user admin, Bale, frontend catalog) are ready and their tests pass; until that moment the legacy fields stay intact and authoritative for unmigrated code. Seeders recreate the platform admin and demo memberships. No dual-write; coexistence is read-only legacy, time-boxed to the cutover. Any database not declared disposable falls back to the roadmap §3 plan.
6. Catalog single-source: backend catalog is canonical; frontend parity is enforced by an automated test (Stage 02) instead of hand-mirroring.
7. Role templates at organization level are a later slice: workspaces keep independent role copies; template propagation requires preview + explicit confirmation, atomically or with a recoverable plan. Concurrency/versioning semantics **OPEN (Q-06)**.

## Consequences
Every existing `hasPermission`/`permission:*` call site is replaced per module during Stage 04/05; frontend permission helpers change functionally (same visuals). The A-series delegation tests (A10/A11/A16) must be re-expressed against membership roles before legacy columns are deleted.
