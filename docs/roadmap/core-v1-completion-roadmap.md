# Core v1 Completion Roadmap (design output; no stage authorized by this document)

**Core v1 completion (C1–C10) finishes before business-module migrations begin**; the legacy departments/teams cutover (L1) is a **post-Core** stage and is not on the Core critical path. Ordering was repaired twice: audit precedes its first consumers (C1), registration/activation (C4) precedes entitlements and real gates (C5), invitations (C6) run only after the quota evaluator (C5) exists, and legacy deletion (L1) is separated from additive Core work (C8). Each stage is one small, independently reviewable PR set, requires its own explicit approval, and runs full CI (SQLite + MySQL gate + frontend + architecture tests). Prerequisites reference `docs/architecture/product-owner-approval-sheet.md` (OD-1…OD-12).

Dependency graph: C1 → C2 · C3 → C4 (registration/activation) → C5 (plans/entitlements, retires pilot gates) → C6 (invitations; needs C5 quota evaluator + C1 audit + C3 lifecycle) · C7 (settings; any time after C1) · C8 (departments additive; after C1) · C9 (Files; needs C5 quota) · C10 (notifications/events/audit completion; needs C1). Post-Core: L1 and business-module migrations.

## C1 — Identity normalization, account lifecycle, minimal audit foundation
- `Core\Identity`; `users.status` normalization (`active/suspended/deactivated`), tokens invalidated on suspension, deactivation ends memberships. **Minimal audit foundation:** `audit_logs` + transactional `Core\Audit` writer + masking registry, wired into identity actions — no later stage may claim audited behavior before this lands.
- Tests: status matrix, suspended denied everywhere incl. resolver, audit-row-iff-commit, masking. Acceptance: C2/C6 prerequisites exist.

## C2 — Platform administration (requires OD-1)
- `platform` catalog scope, `platform_role_assignments`, audited grant/revoke, minimal admin endpoints. No workspace data access, no impersonation.
- Tests: no workspace context resolution for platform admins; every action audited; no self-grant.

## C3 — Organization/workspace lifecycle completion
- Organization status in the decision (step 2); suspend/archive/restore per Decision Spec §5b (archived = read-only, never an authorization bypass); org-membership end cascades transactionally. Audited via C1.
- Tests: lifecycle × operation-class matrix on SQLite + MySQL gate.

## C4 — Module registration & activation foundation
- Explicit registration list; manifest-driven permission registration; dependency/duplicate-ownership validation; `module_definitions` (platform kill-switch), `workspace_modules`, `organization_module_policies`; real `ModuleAvailabilityGate` + minimal `OrganizationPolicyGate`. **Projects untouched** — pilot gates remain exactly as-is (production fail-closed).
- Tests: registration rejections; precedence kill-switch > org ceiling > workspace state with a fixture module.

## C5 — Plans, subscriptions, entitlements; retire pilot gates (requires OD-2)
- `plans/plan_versions/subscriptions/subscription_events/payment_attempts` (manual activation), entitlement + **member/workspace/storage quota evaluator**, real `SubscriptionEntitlementGate`; then rewire Projects to the container-resolved service and **delete `PilotGatePolicy` + pilot config**.
- Tests: Decision Spec §5 status matrix; quota denials at member add/invite/create; downgrade freeze; production-config regression (scoped Projects denies without entitlement, no pilot flag in code).

## C6 — Invitations & membership acquisition (requires OD-3; depends on C1 audit, C3 lifecycle, C5 quota evaluator)
- **First, onboarding-policy persistence:** `organization_onboarding_policies` table (data model §2) with org-manager CRUD authorized by `organization.members.manage`, audited via C1 — deliberately *not* built on C7 settings, which does not exist yet.
- `Core\Invitations` per spec §C / ADR-0015 **as corrected**: full state machine incl. `accepted_pending_org_approval`, invite-time permission snapshot, dual-scope ceilings, in-lock quota at activation moment, inviter-authority-loss rule, audited decisions.
- Tests: the 10 mandatory negative tests (spec §C) + approval-before-activation (no membership rows exist while pending) + approver authorization (only `organization.members.manage` holders; decision actor/reason audited).

## C7 — Scoped settings (requires Q-11 per-key inventory)
- Settings registry (scope/type/default/mandatory/sensitive), resolution chain, encryption + audit on change, user preferences. Independent; any time after C1.
- Tests: mandatory higher-scope wins; sensitive values hidden from lower privilege; unclassified legacy keys stay platform-scope.

## C8 — Workspace departments (additive only; requires Q-07 default)
- `workspace_departments` + members (`is_primary`), services and APIs **alongside** untouched legacy departments. No legacy removal here.
- Tests: flat-only, membership prerequisite, exit cleanup, legacy suites unmodified and green.

## C9 — Files Core (requires OD-4, C5 quota)
- `Core\Files` (files/file_links/epoch-revoked signed links), upload validation, storage quota via C5 evaluator, orphan purge tick. DAM untouched until its module stage.
- Tests: cross-workspace download denial, revoked/expired link denial, quota denial.

## C10 — Notifications, events/outbox, audit coverage completion
- Core notifications inbox/preferences/delivery ticks; `core_outbox` for failure-critical events; **extend** C1 audit to full management-plane coverage (C10 completes audit; it does not introduce it).
- Tests: one audit row per management mutation; delivery cancel-on-membership-loss; outbox idempotency.

## After Core v1 (separate approvals)
- **L1 — Legacy departments/teams cutover (post-Core):** only after every legacy-department consumer (Content/analytics and any other reader, enumerated by a fresh 04B-style inventory) is migrated and regression-green and the zero-reader inventory is evidenced. Deletes `departments.parent_id`, `department_user`, `users.department_id`, `teams*`, `DepartmentConsolidation` gate. Core v1 does **not** depend on L1.
- Business-module migrations (Projects/Tasks completion, Content, DAM on Files Core, Operational Records, Chat, Reporting composition) with `workspace_id` NOT NULL cutovers; identity-column removal at the final identity cutover once all consumers migrated; Stage 08-style fresh-install rehearsal + host evidence (Q-02/Q-03/Q-04).
- **Product stages (outline only):** reusable modules (Tasks → Calendar → Forms → Finance → CRM/HRM → Workflows → Meetings/Notes/Goals/Habits), then solutions (Surveys → Competitions/Challenges → Events → Campaigns → Procurement; Media Operations as composition), implementing contracts §7 pairs; portals only after OD-9; cross-workspace finance reporting only if OD-12 is approved in a later design.

## Deliberate retirement plan
| Mechanism | Retired in | Proven by |
|---|---|---|
| `PilotGatePolicy` + `PROJECTS_WORKSPACE_PILOT` | C5 (production fail-closed until then) | Real gates C4+C5 + production denial regression |
| Projects dual-mode firewall branches | Projects/Tasks module stages | All project records workspace-owned (dev recreation) |
| Legacy identity columns + legacy catalog | Final identity cutover | Scoped RBAC consumers everywhere |
| Legacy global departments/teams | **L1 (post-Core)**, zero-reader inventory required | C8 replacement + migrated consumers |
| `Unimplemented*Gate` defaults | C4/C5 per gate (kept as fail-closed fallback) | Registered implementations |
