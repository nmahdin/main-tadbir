# Core v1 Completion Roadmap (design output; no stage authorized by this document)

Ordering is dependency-driven and was **repaired in the correction pass**: every stage's prerequisites are implemented by earlier stages, audit exists before its first consumer, gate implementations land only after the registration/activation they evaluate exists, and legacy deletion is separated from additive Core work into later tested cutovers. **Core completion finishes before business-module migration stages resume.** Each stage is one small, independently reviewable PR set on the session branch, requires its own explicit human approval, and runs the full CI (SQLite suite + MySQL migration gate + frontend + architecture tests). Approval prerequisites reference `docs/architecture/product-owner-approval-sheet.md` (OD-1…OD-11).

Dependency graph (summary): C1 (identity + **minimal audit foundation**) → C2 (platform admin; needs C1 audit) · C3 (lifecycle) → C4 (invitations; needs C1 audit) · C5a (module registration/activation) → C5b (plans/subscriptions/entitlements → real gates → retire pilot) · C6 (scoped settings; independent, any time after C1) · C7a (workspace departments, additive) → [module migrations] → C7b (legacy department/team cutover) · C8 (Files; needs C5b quota evaluator) · C9 (notifications/events + audit coverage completion; needs C1 audit foundation).

## C1 — Identity normalization, account lifecycle, and minimal audit foundation
- **Scope:** `Core\Identity` service; `users.status` string normalization (`active/suspended/deactivated` + reason), drop `pending` (if approved); suspension invalidates tokens; account deactivation ends memberships transactionally. **Plus the minimal audit foundation moved here from old C9:** `audit_logs` table + `Core\Audit` transactional writer + masking registry, wired into identity actions. Nothing else consumes audit yet — but no later stage may claim "audited" behavior before this lands.
- **DB:** status column enum→string; `audit_logs` (data model §2).
- **Tests:** status transition matrix; suspended/deactivated denied on all surfaces incl. resolver; audit row written iff the mutation commits (rollback ⇒ no row); sensitive fields masked.
- **Acceptance:** C2/C4 prerequisites exist; legacy modules unaffected.
- **Risks/rollback:** auth regression — keep existing middleware semantics; dev data disposable, revert = reverse migration pair.

## C2 — Platform administration (requires OD-1)
- **Scope:** `platform` catalog scope, `platform_role_assignments`, audited grant/revoke + minimal admin endpoints (org/user view+suspend with reason, audit read). Uses C1 audit — no audit work is scheduled here. No workspace data access, no impersonation.
- **DB:** `platform_role_assignments`.
- **Tests:** platform admin cannot resolve workspace contexts; every action audited; no self-grant.
- **Acceptance:** ADR-0014 demonstrated; Q-10 closed.

## C3 — Organization/workspace lifecycle completion
- **Scope:** organization status in the authorization decision (step 2, `organization_inactive`); suspend/archive/restore transitions per Decision Spec §5b (archived = read-only); org-membership end ⇒ workspace memberships ended transactionally. Audited via C1.
- **DB:** status values only.
- **Tests:** suspended org denies all its workspaces; archived workspace read/export allowed, writes 403 `operation_restricted`; restore returns to active; revocation immediate (SQLite + MySQL gate).
- **Acceptance:** lifecycle matrix green; no consumer depends on C5+ behavior.

## C4 — Invitations & membership acquisition (requires OD-3)
- **Scope:** `Core\Invitations` per ADR-0015 **as hardened**: inviter `*.members.manage` + dual-scope grant ceilings with invite-time snapshot, org onboarding policy (`allow/require_org_admin_approval/deny`, approval mode activates nothing pre-approval), implicit org membership = protected Member role only, single-transaction acceptance under scope lock with in-lock quota check, audited transitions. Uses C1 audit and C3 lifecycle states (suspended/archived targets reject).
- **DB:** `invitations`.
- **Tests:** the full negative list in spec §C (ceiling escalation, replay, expiry/cancel, policy-deny, approval gating, quota race with exactly one winner, suspended/archived target, non-manager inviter).
- **Acceptance:** Q-08 closed; no membership exists without role, quota pass, and audit row.

## C5a — Module registration & activation foundation (split from old C7)
- **Scope:** explicit module registration list, manifest-driven permission registration into the Core catalog, dependency/duplicate-ownership validation, `module_definitions` (incl. platform kill-switch), `workspace_modules`, `organization_module_policies`; implement **`ModuleAvailabilityGate`** and the minimal **`OrganizationPolicyGate`** (module ceiling + mandatory-policy checks) against real activation state. **No subscription behavior and no Projects change in this stage** — the pilot gates remain exactly as they are (production fail-closed).
- **DB:** activation tables (data model §2).
- **Tests:** registration rejects unknown dependency/duplicate permission ownership; precedence kill-switch > org ceiling > workspace activation proven with a fixture module; disabled module denies despite role permission.
- **Acceptance:** gate steps 7–8 of the Decision Spec run on real data for the fixture module; Projects pilot untouched and still green.

## C5b — Plans, subscriptions, entitlements; retire the pilot gates (requires OD-2)
- **Scope:** `plans/plan_versions/subscriptions/subscription_events/payment_attempts` (manual activation), effective-entitlement + quota evaluator, **`SubscriptionEntitlementGate`** on real data; then rewire Projects to the container-resolved `AuthorizationService` and **delete `PilotGatePolicy`, `config/projects.php`, and the dedicated pilot service instance**.
- **DB:** billing tables (data model §2).
- **Tests:** Decision Spec §5 status matrix end-to-end; quota denials (members/workspaces/storage); downgrade freeze; new module disabled by default in existing plan versions; **production-config regression: scoped Projects denies without entitlement and no pilot flag exists in code/config**; pilot tests migrated to entitled fixtures.
- **Acceptance:** Q-01 closed; gates for Projects are entirely real (steps 7–10); temporary-mechanism retirement table updated.

## C6 — Scoped settings (requires Q-11 inventory per key)
- **Scope:** settings registry (scope/type/default/mandatory/sensitive per key), resolution chain, sensitive encryption + audit on change (C1 writer), user preferences on the same service. Independent of C5; may run any time after C1.
- **DB:** `core_settings`.
- **Tests:** mandatory higher-scope values cannot be overridden below; sensitive values never exposed to lower-privilege readers; unclassified legacy keys stay platform-scope.
- **Acceptance:** legacy `system_settings` consumers enumerated; migration of individual keys is per-key follow-ups, not this stage.

## C7a — Workspace departments (additive only) (requires Q-07 default approval)
- **Scope:** `workspace_departments` + members (`is_primary`), services, and APIs **alongside** the untouched legacy department system. No legacy table, column, route, or authorization path is removed or altered in this stage.
- **DB:** new tables only.
- **Tests:** flat-only model; department membership requires active workspace membership; leaving a workspace removes department rows; legacy department features regression-green (existing suites unmodified).
- **Acceptance:** replacement exists and is independently usable; zero legacy consumer touched.

## C7b — Legacy departments/teams cutover (only after every consumer migrated)
- **Prerequisites (hard):** Content/analytics and every other legacy-department consumer (enumerated in the stage's inventory, the 04B pattern) migrated to workspace departments or to non-department semantics, with their regression suites green; `users.department_id` analytics semantics replaced by the `is_primary` pivot.
- **Scope:** delete `departments.parent_id`, `department_user` (incl. free-text role), `users.department_id`, `teams*` artifacts and the `DepartmentConsolidation` gate, in tested commits after the consumer inventory shows zero readers.
- **Tests:** full suite green post-deletion; architecture test asserts no legacy department references remain.
- **Acceptance:** ADR-0006 realized with evidence, not by assumption; rollback = restore tables from migration `down()` + revert (dev recreation acceptable).

## C8 — Files Core (requires OD-4 numbers, C5b quotas)
- **Scope:** `Core\Files` (files/file_links/signed links with revocation epoch), upload validation, storage quota via the C5b evaluator, orphan purge tick. DAM untouched until its module stage.
- **DB:** files tables + `workspaces.file_epoch`.
- **Tests:** cross-workspace download denial; expired/epoch-revoked link denial; quota denial; link-to-foreign-record denial; one existing attachment flow mediated as integration proof (not a Tasks migration).
- **Acceptance:** Q-09 closed.

## C9 — Notifications, events/outbox, and audit coverage completion
- **Scope:** Core notifications inbox + preferences + Bale/email delivery ticks; `core_outbox` for failure-critical events with dead-letter audit; **extend** the C1 audit foundation to full management-plane coverage (03B role services, C2–C8 services) — C9 completes coverage, it does not introduce audit.
- **DB:** notifications/outbox tables.
- **Tests:** every management mutation has exactly one audit row; delivery retry + cancel-on-membership-loss; outbox duplicate-drain idempotency.
- **Acceptance:** D-18 fully realized; A-series audit re-run recommended.

## After Core v1 (separate approvals)
Business-module migrations (finish Projects/Tasks, Content, DAM on Files Core, Operational Records incl. ideas front-end, Chat, Reporting composition), each with `workspace_id` NOT NULL cutovers and legacy deletion; C7b slots in once its consumers are done; then Stage 08-style cleanup (legacy identity columns removal at the identity cutover once **all** consumers migrated, legacy catalog retirement, final fresh-install rehearsal + host runbook evidence Q-02/Q-03/Q-04).

**Product stages (outline only, authorized separately, catalog order):** reusable modules first (Tasks completion → Calendar → Forms → Finance → CRM/HRM → Workflows → Meetings/Notes/Goals/Habits), then specialized solutions composing them (Surveys → Competitions/Challenges → Events → Campaigns → Procurement; Media Operations as composition), each implementing the `cross-module-contracts.md` pairs it needs (§7 cardinality table); portal surfaces only after OD-9. Personal OS surfaces build on the same modules with personal-workspace contexts — no Core changes expected beyond C-stage completions.

## Deliberate retirement plan (temporary mechanisms)
| Mechanism | Retired in | Replacement proven by |
|---|---|---|
| `PilotGatePolicy` + `PROJECTS_WORKSPACE_PILOT` | C5b (not before; fail-closed in production until then) | Real gates C5a+C5b + production denial regression |
| Projects dual-mode legacy firewall branches | Projects/Tasks module stages | All project records workspace-owned (dev recreation) |
| Legacy identity columns + legacy permission catalog | Post-Core identity cutover | Scoped RBAC consumers everywhere |
| Legacy global departments/teams | **C7b only**, after consumer inventory = zero readers | Workspace departments (C7a) + migrated consumers |
| `Unimplemented*Gate` defaults | C5a/C5b per gate (kept as fail-closed fallback for unregistered modules) | Registered implementations |
