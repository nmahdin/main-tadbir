# Architecture Decision Register — TADBIR Comprehensive (Stage 01)

Status rule: **ACCEPTED** = mandated by the approved playbook / user instruction, or accepted by the reviewer on 2026-10-15 (**ACCEPTED*** = D-06…D-16 and D-18, accepted as *target direction* subject to the documented OPEN questions and the conditional-approval corrections in `01-stage-01-completion-report.md` §9). **PROPOSED** = recommended, not yet decided. **OPEN** = undecided; no implementing stage may invent the answer. Baseline: `b30bfef…`, Stage 00 audit.

## Decisions
| ID | Decision | Status | Source / ADR |
|---|---|---|---|
| D-01 | Modular monolith, one Laravel deployment; module-owned code/data; cross-module contracts/events only; no direct cross-module table writes | ACCEPTED (playbook rule 16) / boundaries ACCEPTED* via D-06…D-18 approval | ADR-0001 |
| D-02 | Keep Laravel + React/TS/Tailwind; no UI/Design System redesign in backend stages; functional frontend coordination only | ACCEPTED | Playbook rule 16; revised strategy §4 |
| D-03 | Revised strategy: development-stage system, no legacy-data preservation; replace over backfill; delete obsolete code after replacement passes tests | ACCEPTED | User clarification 2026-10-15 |
| D-04 | No reset of shared/staging/production DB without separate explicit authorization naming the environment | ACCEPTED | Revised strategy rule 9; ADR-0007 |
| D-05 | Workspace = strict operational boundary; exactly-one-workspace per operational record; never trust client `workspace_id` | ACCEPTED | Playbook rules 4, safeguards; ADR-0002/0008 |
| D-06 | Workspace ownership XOR (`owner_user_id` XOR `organization_id`); derived kind; one default personal workspace per user; one default org workspace per organization, created atomically | ACCEPTED* | ADR-0002 |
| D-07 | Independent organization & workspace memberships; org admin ≠ workspace access; last-manager/admin invariants | ACCEPTED* | ADR-0003 |
| D-08 | Workspace-scoped RBAC: scoped roles, one active role per membership, protected Workspace Manager/Member, custom roles, grant ceiling, 422 on unknown keys | ACCEPTED* | ADR-0004 |
| D-09 | Legacy identity replacement (not migration): delete `users.role_id/role_key/department_id`, `department_user.role` when RBAC lands; seeders recreate access | ACCEPTED* | ADR-0004/0006 |
| D-10 | Rename legacy `WorkspaceRecord` → Operational Records (`operational_records`) at module migration; user-facing routes may stay | ACCEPTED* | ADR-0005 |
| D-11 | Departments workspace-scoped, flat, optional; no team entity; legacy teams + consolidation gate removed (dev schema recreated) | ACCEPTED* | ADR-0006 |
| D-12 | Default data path = disposable-dev reset + seed at approved reset points; single-org conversion only as contingency for a non-disposable DB | ACCEPTED* | ADR-0007 |
| D-13 | One central authorization decision for HTTP + Bale + jobs + Google; query-level workspace scoping; per-module cutover with removal criteria; adversarial tests per slice | ACCEPTED* | ADR-0008 |
| D-14 | Domain validation enforces invariants on both DB engines; DB constraints per verified engine; PHP backed enums over native MySQL ENUM for new statuses; MySQL test mandatory from Stage 03 | ACCEPTED* | ADR-0009 |
| D-15 | Four separate gates: subscription entitlement ≠ org policy ≠ workspace activation ≠ user permission; new features default-disabled in all plans; payments ≠ subscription; manual activation only | ACCEPTED* (target direction; lifecycle OPEN per Q-01) | ADR-0010 |
| D-16 | Background work: synchronous by default; idempotent triggerable ticks; transactional outbox only for proven-critical events with host-operable drain | ACCEPTED* | ADR-0011 |
| D-17 | Coding standards + project structure are mandatory stage gates; tooling introduced gradually (Pint, PHPStan ratchet, TS strict ratchet, ESLint/Prettier, architecture tests); no cosmetic repo-wide reorganization | ACCEPTED gate principle / specifics ACCEPTED* as corrected (400-line = review threshold) | ADR-0012; `docs/CODING_STANDARDS.md`; `docs/PROJECT_STRUCTURE.md` |
| D-18 | Audit log (Core) distinct from user-facing `activity_logs` feed; sensitive membership/role/policy/subscription/settings changes audited | ACCEPTED* | Core §2; ADR-0008 |

## Open questions (blockers tagged)
| ID | Question | Status | Blocks |
|---|---|---|---|
| Q-01 | Subscription lifecycle: status enum/transitions, grace/expiry/suspension semantics, post-expiry read/export rights, overlap resolution, personal extra-workspace billing edges, refund/void | OPEN | **Stage 06 start** (hard blocker) |
| Q-02 | Production MySQL version/storage engine; installed-schema provenance (migrations vs manual `.mysql.sql`) | OPEN (UNKNOWN) | DB-level XOR/uniqueness promises in Stage 03; Stage 08 runbook |
| Q-03 | Real host capabilities: Cron/cPanel or external scheduler, execution limits, outbound quotas | OPEN (UNKNOWN) | Stage 07 mechanism finalization; Stage 08 runbook |
| Q-04 | Backup tooling, destination, retention, RPO/RTO; restore rehearsal evidence | OPEN (UNKNOWN) | Any non-disposable DB work; Stage 08 go/no-go |
| Q-05 | Membership status enums (`active/deactivated/ended`?) for org & workspace memberships; rejoin semantics detail | OPEN | Stage 03 schema (must ratify in Stage 03 PR design review) |
| Q-06 | Org role-template → workspace role propagation: versioning, conflict/concurrency, atomicity vs recoverable plan | OPEN | Role-template slice (post-Core) |
| Q-07 | "Primary department" still needed for analytics? (explicit pivot flag vs redefined analytics) | OPEN | Departments/Content analytics slice (Stage 05) |
| Q-08 | Invitation design: token format/expiry, identity verification of unregistered invitees, idempotency | OPEN | Membership/invitation slice (Stage 03/04) |
| Q-09 | Signed DAM temporary-link TTL; must workspace revocation invalidate outstanding links? | OPEN | DAM slice (Stage 05) / Stage 07 file service |
| Q-10 | Platform-admin scope: exact platform vs organization vs workspace admin powers (draft core §11) | OPEN | Stage 03 permission catalog design |
| Q-11 | `OrganizationSettings` content: which legacy global settings become org settings vs platform settings vs workspace settings | OPEN | Stage 03/07 settings slices |
| Q-12 | Disposition of open PRs #11 (content system, 100 files) & #12 (design-system) merge order vs Stage 02/03 | OPEN (human sequencing) | Stage 02 start (practical blocker) |

## Decisions explicitly required from the human reviewer before Stage 02
1. Approve/reject the PROPOSED set (D-06…D-16, D-18) — or list exceptions. (Approving this PR accepts them.)
2. Sequence Q-12: merge order for PRs #11/#12/#13 relative to Stage 02 (agent will not merge/close any of them).
3. Confirm Stage 02 scope includes the first tooling subset (Pint config, PHPStan baseline, architecture-test skeleton, permission-parity test) — i.e. dev-dependency additions for tooling are acceptable then.
4. Before Stage 03 (not Stage 02): ratify Q-05 and Q-10; provide or obtain Q-02 evidence if DB-level constraints are wanted in the first schema; confirm named disposable dev database(s) for the Stage 03 reset (D-04 authorization).
5. Before Stage 06: ratify Q-01. Before Stage 07/08: evidence Q-03/Q-04.
