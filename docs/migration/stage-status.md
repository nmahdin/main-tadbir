# Migration Stage Status

| Stage | Branch / commit | PR | Scope | Acceptance | Checks | Known issues | Approval | Next permitted |
|---|---|---|---|---|---|---|---|---|
| 00 — Audit | `arena/582a70e5-main-tadbir` @ `b30bfef…` (report added in Stage 01 PR) | this PR | Read-only inventory, risks, baseline | Accepted by human as audit baseline (2026-10-15) | Frontend 140/140 + typecheck PASS locally; backend PHPUnit NOT RUN (no PHP); CI run 38242087918 PASS on audited commit | Prod MySQL/backup/scheduler UNKNOWN | **Accepted** | 01 |
| 01 — Architecture contracts | `arena/582a70e5-main-tadbir` (this PR) | this PR | Reconciled core + roadmap, ADR-0001…0012, decision register, A01–A16 matrix, disposition inventory, coding standards + project structure | Awaiting human review | Docs-only; CI on this PR | Q-01…Q-12 open (register) | **Pending** | 02 only after approval |
| 02 — Modular skeleton & quality gates | — | — | PROJECT_STRUCTURE §5 step 1–2; CODING_STANDARDS §6 subset | Not started | — | Blocked on Stage 01 approval + Q-12 sequencing | Not approved | — |
| 03–08 (revised roadmap) | — | — | See `docs/roadmap/migration-to-tadbir-comprehensive.md` | Not started | — | Q-05/Q-10 (03), Q-01 (06), Q-02/03/04 (07/08) | Not approved | — |

Rule (playbook): a stage is approved only by explicit human acceptance of its PR/report. This file is updated in each stage's own PR.
