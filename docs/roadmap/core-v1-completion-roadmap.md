# Core v1 Completion Roadmap (design-freeze output; no stage authorized by this document)

Ordering is dependency-driven. **Core completion (C1–C9) finishes before business-module migration stages (Tasks/Content/DAM/Chat…) resume.** Each stage is one small, independently reviewable PR set on the session branch, requires its own explicit human approval, runs the full CI (SQLite suite + MySQL migration gate + frontend + architecture tests), and follows the removal rule: legacy structures are deleted only in the stage whose replacement is implemented and tested. Approval prerequisites reference the open decisions in `docs/architecture/core-design-review-report.md` (OD-1…OD-5).

## C1 — Identity normalization & account lifecycle
- **Scope:** `Core\Identity` service; `users.status` string normalization (`active/suspended/deactivated` + reason), drop `pending` (if approved); suspension invalidates tokens; account deactivation ends memberships transactionally; platform-visible account admin endpoints (behind OD-1 keys or interim legacy admin guard — specify in stage).
- **DB:** status column enum→string change (fresh-schema friendly; production path per ADR-0007 contingency only).
- **Tests:** status transition matrix, suspended user denied on all surfaces (incl. resolver), historical records preserved.
- **Acceptance:** no surface authenticates a suspended/deactivated account; legacy modules unaffected.
- **Risks/rollback:** auth regression — stage behind existing middleware semantics; revert = restore enum migration (dev data disposable).

## C2 — Platform administration (requires OD-1)
- **Scope:** `platform` catalog scope, `platform_role_assignments`, grant/revoke services (audited), minimal admin endpoints (org/user view+suspend with reason, audit view). No workspace data access, no impersonation.
- **DB:** `platform_role_assignments` table.
- **Tests:** platform admin cannot resolve workspace contexts (403 membership-missing), every action audited, non-admin cannot self-grant.
- **Acceptance:** ADR-0014 behaviors demonstrated; Q-10 closed.

## C3 — Organization/workspace lifecycle completion
- **Scope:** org status in the authorization decision (step 2), suspend/archive transitions for orgs & workspaces with manager/platform services, org-membership end ⇒ workspace memberships ended transactionally, workspace archival read-only enforcement.
- **DB:** status values only (columns exist).
- **Tests:** suspended org denies all its workspaces; archived workspace read-only; revocation immediate.
- **Acceptance:** lifecycle matrix green on SQLite + MySQL gate.

## C4 — Invitations & membership acquisition (requires OD-3)
- **Scope:** `Core\Invitations` (ADR-0015): create/cancel/accept, hashed tokens, expiry, quota check at acceptance, org-membership auto-acquisition on workspace invites, audited manager self-join.
- **DB:** `invitations` table.
- **Tests:** expiry/cancel/reuse denial, cross-scope role rejection, grant-ceiling at invite, accept-twice idempotency, two-workspace isolation of pending invites.
- **Acceptance:** Q-08 closed; no path creates a membership without role + audit.

## C5 — Plans, subscriptions, entitlements; retire pilot gates (requires OD-2)
- **Scope:** `plans/plan_versions/subscriptions/subscription_events/payment_attempts` (manual activation), entitlement + quota evaluator, real gate implementations (`SubscriptionEntitlementGate`, `OrganizationPolicyGate` minimal, `ModuleAvailabilityGate` with C7 activation or interim platform definition state), **delete `PilotGatePolicy`, `config/projects.php` pilot flag, and the Projects dual service instance**; Projects authorizes via container-resolved service.
- **DB:** §E tables (data model §2).
- **Tests:** status matrix (Decision Spec §5) end-to-end, quota denials, downgrade freeze, new module disabled by default, **regression: scoped Projects denies in production-like config without entitlement**, pilot-policy absence asserted.
- **Acceptance:** Q-01 closed; production fail-closed proven by tests without any pilot flag.

## C6 — Workspace departments cutover (requires OD on Q-07 default)
- **Scope:** `workspace_departments` + members (`is_primary`), department services, analytics primary-department semantics from pivot flag; delete legacy `departments.parent_id/department_user.role/users.department_id` + teams artifacts + consolidation gate after dependents migrated (dev recreation).
- **DB:** new tables; legacy removals in the same stage's later commit.
- **Tests:** flat-only model, department requires workspace membership, leaving workspace removes department rows, analytics parity checks.
- **Acceptance:** ADR-0006 realized; no code references legacy department structures.

## C7 — Settings & module lifecycle completion (requires Q-11 inventory)
- **Scope:** scoped settings registry + resolution + sensitive-value handling; manifest-driven permission registration into the catalog; module registration list + dependency checks; `module_definitions/workspace_modules/organization_module_policies` + activation services wire gate step 7 fully.
- **DB:** settings/activation tables (data model §2).
- **Tests:** mandatory higher-scope settings cannot be overridden, activation precedence (kill-switch > org ceiling > entitlement > workspace), unknown dependency/duplicate permission ownership rejected at registration.
- **Acceptance:** new-module onboarding is manifest+registration only (proven with a fixture module).

## C8 — Files Core (requires OD-4 numbers)
- **Scope:** `Core\Files` (files/file_links/signed links with revocation epoch), upload validation + storage quota hookup, orphan purge tick; DAM untouched until its module stage consumes the contract.
- **DB:** files tables + `workspaces.file_epoch`.
- **Tests:** cross-workspace download denial, expired/revoked link denial, quota denial, link-to-foreign-record denial.
- **Acceptance:** Q-09 closed; one existing attachment flow (tasks) demonstrably mediated (integration proof, not a Tasks migration).

## C9 — Audit, notifications, events/outbox
- **Scope:** `audit_logs` transactional writer wired into all management services built in C1–C8 (+03B role services), Core notifications inbox + preferences + Bale/email delivery ticks, `core_outbox` for failure-critical events with dead-letter audit.
- **DB:** audit/notifications/outbox tables.
- **Tests:** every management mutation has exactly one audit row (rollback ⇒ no row), masked sensitive fields, delivery retry/cancel-on-membership-loss, outbox idempotency (duplicate drain = single effect).
- **Acceptance:** D-18 realized; A-series audit suite re-run recommended.

## After Core v1 (separate approvals)
Business-module migrations (finish Projects/Tasks, Content, DAM on Files Core, Operational Records, Chat, Reporting scoping), each with `workspace_id` NOT NULL cutovers and legacy deletion; then Stage 08-style cleanup (legacy identity columns `users.role_id/role_key` removal at the identity cutover once **all** consumers migrated, legacy catalog retirement, final fresh-install rehearsal + host runbook evidence Q-02/Q-03/Q-04).

**Product stages (outline only, authorized separately, catalog order):** reusable modules first (Tasks completion → Calendar → Forms → Finance → CRM → Workflows → Notes/Goals), then specialized solutions composing them (Surveys → Competitions/Challenges → Events → Media Ops → Campaigns), each implementing the `cross-module-contracts.md` pairs it needs; portal surfaces only after OD-9. Personal OS surfaces (dashboard composition, goals/habits, personal finance profile of `finance`) build on the same modules with personal-workspace contexts — no Core changes expected beyond C-stage completions.

## Deliberate retirement plan (temporary mechanisms)
| Mechanism | Retired in | Replacement proven by |
|---|---|---|
| `PilotGatePolicy` + `PROJECTS_WORKSPACE_PILOT` | C5 | Real gates + production denial tests |
| Projects dual-mode legacy firewall branches | Projects/Tasks module stages | All project records workspace-owned (dev recreation) |
| Legacy identity columns + legacy permission catalog | Post-Core identity cutover | Scoped RBAC consumers everywhere; parity tests switched to scoped catalog |
| Legacy global departments/teams | C6 | Workspace departments tests |
| `Unimplemented*Gate` defaults | C5/C7 (kept as fail-closed fallback for unregistered modules) | Registered implementations per module |
