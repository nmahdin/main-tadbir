# Migration Roadmap — From Current TADBIR to TADBIR Comprehensive (Revised, Stage 01)

- **Status:** PROPOSED — awaiting explicit human approval of this Stage 01 PR. No stage below is authorized by this document alone; each stage requires its own approval (playbook human review gate).
- **Strategy (revised 2026-10-15, supersedes the legacy-preserving draft roadmap in PR #13):** TADBIR is a development-stage system. **No important production data must be preserved.** We therefore use *controlled architectural refactoring*: clean target architecture first, replace obsolete structures instead of emulating them, change APIs/internal contracts where justified (coordinating functional frontend changes; visual design remains the other contributor's), preserve valuable business logic and working features, and delete obsolete code once its replacement is tested.
- **Explicitly removed from the old plan:** legacy backfills, dual-write periods, compatibility adapters, per-table legacy mapping sheets, and exception-register machinery **for disposable development data**. They return (playbook Stages 04/10 style) only if a specific database is later declared non-disposable.
- **Hard limits that did NOT change:** workspace isolation, authorization, automated testing, module boundaries; Laravel modular monolith; small reviewable stages; **no reset of any shared/staging/production database without separate explicit authorization**; no production deploy/data change without approval.

Baseline: Stage 00 audit (`docs/migration/00-current-state-audit.md`, commit `b30bfef…`). Target contracts: `docs/architecture/core.md` + `docs/adr/`.

---

## 1. Implementation order (playbook stage numbers kept for traceability)

### Stage 02 — Modular skeleton and quality gates *(docs: playbook Stage 02)*
Introduce the modular folder/namespace layout (Platform/Core + business modules) **without relocating working features wholesale**; minimal module registration + contracts; tests proving registration; add the missing quality gates identified in Stage 00 (PHP static analysis or a documented decision against it, Pint enforcement, permission-catalog parity test PHP↔TS). Exit criteria: route inventory unchanged, existing suites pass, no schema change, no frontend styling change.
*Clean-reset useful? No.*

### Stage 03 — Core domain on a clean schema *(replaces playbook Stages 03+04+05 backfill parts)*
Additive-then-replacing schema in **disposable development databases**: `organizations`, `workspaces` (XOR ownership enforced in domain validation everywhere + DB constraint per verified engine), `organization_memberships`, `workspace_memberships` (one active role), scoped `roles/permissions`, workspace-scoped flat `departments` (+ plain membership pivot). Seeders/factories create: platform admin, one demo organization + default workspace, one personal default workspace per seeded user, protected **Workspace Manager** / **Member** roles. **Legacy columns/tables (`users.role_id`, `users.role_key`, `users.department_id`, `department_user.role`, `departments.parent_id`, `teams*`) are removed in this stage's development schema, not migrated.** APIs for organization/workspace/membership management with model/constraint/authorization tests. Fresh-install test on SQLite **and** MySQL (disposable) required.
*Clean-reset useful? **Yes — primary reset point.** Creating the clean Core schema is far cheaper on a recreated dev database than via in-place column surgery. Requires explicit authorization per database; shared/staging/production resets are NOT implied.*
*Frontend coordination:* new workspace-context API contract (selection, membership DTOs) agreed with the frontend contributor; no visual changes.

### Stage 04 — Central authorization and workspace isolation (one slice) *(playbook Stage 06, pulled forward)*
Implement the single authorization decision (Core §2.1) and workspace resolution; migrate **one bounded end-to-end resource** first (recommended: Projects — it has membership, tasks, files and search touchpoints) including list/detail/mutation/search/file/background paths. Adversarial cross-workspace + IDOR tests are the exit gate. Legacy global-role checks for *unmigrated* modules keep working temporarily **inside the monolith only** — this is a coexistence of two authorization *checks*, not dual-written data, and each module's switch is a small tested PR (ADR-0008 records the removal criterion per module).
*Clean-reset useful? No (reseeding demo data suffices).*

### Stage 05 — Module-by-module adoption *(playbook Stage 09, simplified)*
One approved module per PR, in dependency order proposed by Stage 00 evidence: (1) Projects & Tasks (completed in Stage 04 slice, then finished), (2) Content (normalize payload-carried access data into columns/relations), (3) DAM & Files (Core file-access contract), (4) Operational Records — rename/replace `workspace_records` per ADR-0005 and normalize each record kind, (5) Chat & Comments (real conversation/message tables replace `domain_records` payload storage), (6) Notifications inbox (Core), (7) Reporting (scoped search/analytics), (8) Integrations — Bale and Google become adapters over the central contracts (Bale must not keep a parallel permission copy). Each PR: `workspace_id` on the module's operational tables (added via fresh schema/seed in dev), workspace-scoped queries, registered permission keys, regression + isolation tests, obsolete code deleted in the same or the immediately following PR.
*Clean-reset useful? Per module, optionally — a module's dev data may be recreated instead of migrated whenever its schema is normalized (notably Operational Records and Chat). Each reset is dev-only and authorized per case.*

### Stage 06 — Entitlements *(playbook Stage 07)*
Feature/module registry, plans, effective-subscription evaluator, org policy gate, workspace module activation, limit enforcement (workspace/member/storage over-limit behaviors per playbook rules 11–12), manual activation, payment attempts as a separate concept. **Blocked on Q-01 (subscription lifecycle semantics)** — that decision must be ratified before this stage starts; the stage must not invent statuses.
*Clean-reset useful? No.*

### Stage 07 — Shared Core services and reliability *(playbook Stage 08)*
Scoped settings, audit log, notifications delivery, secure file download, background/event plumbing per ADR-0011 (sync + triggered ticks by default; outbox only for proven-critical events with a host-operable drain). Example integration + isolation/retry tests per service.
*Clean-reset useful? No.*

### Stage 08 — Cleanup and readiness *(playbook Stage 10, minus legacy-data machinery)*
Delete remaining legacy structures (any surviving global-role code paths, `DepartmentConsolidation` gate, legacy team artifacts, stale inventories/docs), fresh-install + seeded-upgrade tests on SQLite **and** MySQL, access-control negative-test evidence (incl. the A-series matrix, `docs/migration/security-audit-status.md`), deployment/backup runbook **proven on the actual host** (backup capability, restore rehearsal, scheduler reality — all UNKNOWN today, Q-02/Q-03/Q-04), go/no-go checklist. Production deployment still requires separate explicit instruction.
*Clean-reset useful? A final fresh-install rehearsal is the point of the stage (disposable environments only).*

### What disappeared vs the playbook's original sequence, and why
| Playbook element | Revised disposition |
|---|---|
| Stage 04 (legacy ownership mapping, dry-run backfill, exception register) | **Eliminated for disposable dev data**; replaced by reset+seed (Stage 03). Reinstated only for a database explicitly declared non-disposable (see §3) |
| Stage 05's "do not yet remove legacy role_id/department fields; transitional source-of-truth policy" | **Eliminated**; legacy identity columns are removed when workspace RBAC lands (Stage 03/04). No dual source of truth exists at any point |
| Compatibility switches / adapters (Stage 06 "only if justified") | **Not planned.** Authorization coexistence in Stage 04/05 is per-module check replacement, each with a removal criterion, not a data adapter |
| Expand → backfill → switch → contract | Replaced by **create clean → switch module → delete obsolete**, possible only because data is disposable |

## 2. Database reset policy (proposed; ADR-0007/0009)
1. A reset means: drop and recreate a **named, disposable development database**, run all migrations fresh, run seeders/factories. Nothing else may be called a reset.
2. Every reset requires explicit human authorization naming the environment. Authorization for one environment never extends to another. Shared, staging, and production databases are **never** reset under this roadmap without separate explicit authorization (revised-strategy rule 9).
3. Preferred reset points: Stage 03 (Core schema), optionally per-module in Stage 05 (Operational Records, Chat), Stage 08 (final fresh-install rehearsal).
4. Before any reset of a database that anyone else might use, the responsible human confirms disposability in the stage PR. The agent never connects to or resets a non-local database on its own initiative.

## 3. Fallback if a database is later declared non-disposable
If production (or any database) is later declared to contain data that must survive, the following playbook machinery is reinstated **for that database only**, as a separately approved plan before any Stage 03+ schema reaches it: source→target mapping per table, deterministic ownership rule per record, idempotent dry-run backfill, before/after counts, quarantine (never silent assignment) of ambiguous records, reconciliation report, tested restore path. The architecture in `docs/architecture/core.md` does not change; only the data path does.

## 4. Cross-cutting rules for every stage
- One stage = one reviewable PR (or a small stacked set explicitly approved); branch per session policy; no merge/deploy without explicit human instruction.
- Every stage: run backend PHPUnit, frontend tests + typecheck, build where relevant; report PASS/FAIL/NOT RUN honestly (backend tests cannot run in every sandbox — see Stage 00 §8).
- Permission keys, module IDs, and event names are registered contracts, versioned with the module; frontend catalog kept in parity by test (Stage 02).
- JSON `payload` columns may remain for genuinely schemaless content, but **authorization, ownership, membership, and relational integrity must never live only in payload** in migrated modules.
- Stage 00's unknowns (production MySQL version, backup/restore, scheduler, consolidation-gate state) must be evidenced before any stage that depends on them; they do not block documentation or disposable-dev work.

## 5. Stage 01 exit state
Architecture contracts + ADRs + decision register + security matrix + retain/refactor/replace/remove inventory are delivered in this PR. **Next permitted step after approval: Stage 02 only.**
