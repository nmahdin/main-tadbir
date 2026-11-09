# Documentation Disposition Inventory — Stage 02.5 (2026-10-15)

Baseline `473d14c`. Classes: **KEEP** authoritative · **UPDATE** useful but stale, corrected · **MERGE** duplicated, consolidated · **ARCHIVE** historical, moved to `docs/archive/` · **DELETE** obsolete, removed. Rule applied before every deletion/move: unique technical content is either preserved in a canonical document or demonstrably obsolete; security/deployment/operational documents were never deleted for age.

## Before → After (all product documentation)
| Document (before) | Class | After / justification |
|---|---|---|
| `docs/architecture/core.md`, `docs/roadmap/migration-to-tadbir-comprehensive.md`, `docs/adr/*` (13), `docs/CODING_STANDARDS.md`, `docs/PROJECT_STRUCTURE.md`, `docs/architecture/modular-foundation.md` | KEEP | Unchanged; approved Stage 01/02 baseline |
| `docs/migration/00…02 reports, decisions register, security matrix, disposition inventory, stage-status` | KEEP (+UPDATE one note) | Stage programme records; the A-series caveat in the security matrix was corrected (see UPDATE row below) |
| `docs/bale-bot.md`, `docs/dam-architecture.md`, `docs/architecture/chat-and-comments.md`, `docs/google-workspace.md`, `docs/seeders.md`, `docs/username-accounts.md`, `docs/ui-standards.md` | KEEP | Current domain docs; indexed in `docs/README.md` |
| `docs/deployment.md`, `docs/deployment/{bale-experience,bale-menus-and-automations,bale-webhook,departments-consolidation,smart-tasks-publication}.md`, `docs/environment.md`, `docs/operations.md` | KEEP | Deployment/operational; links into archived reports repaired. `docs/deployment/*.mysql.sql` untouched — file paths are referenced from application code (`OperationsSchema`, `DepartmentConsolidation`), moving them would break operational instructions |
| `docs/security/{access-control-review,access-control-phase1}.md`, `backend/audits/README.md`, `backend/audits/AccessControlAuditTest.php` | KEEP (+UPDATE banner on audits README) | Security-relevant; banner now defers to the current A01–A16 matrix instead of its 2026-09-28 counts |
| `docs/security/{route-inventory.csv,permission-inventory.csv,inventory-summary.json}` | KEEP (labelled stale) | Generated snapshots of 2026-09-28; labelled non-authoritative in the index with the regeneration command. Not deleted: the permissions CSV is the input format reviewers used; regeneration belongs to a code stage (needs PHP route dump). Known: old script's two-segment regex under-reports 3-segment keys (Stage 02 finding) |
| `backend/README.md` | KEEP | Current backend runbook |
| `frontend/README.md` | **UPDATE (+DELETE of obsolete content)** | Rewritten. Deleted content: the AI-Studio app template (banner image, `GEMINI_API_KEY`, AI Studio links) — it described a different product scaffold and its instructions were wrong for this repo (obsolete, no unique value); the stale claim that `AppContext` uses demo/localStorage as its current state was replaced by pointers to the real API layer. Unique useful instructions (`VITE_API_URL`/`VITE_SANCTUM_URL`, same-domain guidance) were preserved in the rewrite |
| `TEST_GUIDE.md` | UPDATE (banner) | Manual QA value retained; banner flags the retired "teams" sections and points to the consolidation doc + Stage 00 baseline |
| `docs/migration/security-audit-status.md` | UPDATE (one paragraph) | Corrects Stage 00's erroneous claim that `backend/audits/AccessControlAuditTest.php` no longer exists (it does); statuses themselves unchanged |
| `backend/AGENTS.md` + `backend/CLAUDE.md` | KEEP (not merged) | Byte-identical Laravel Boost guideline entry points; merging would risk breaking one of the two AI tools that read these filenames. Duplication is intentional and documented in the index |
| `backend/.agents/skills/**` (39 files), `backend/.agents/skills/**/references|rules/*` | KEEP | Tool skills, not product docs; out of consolidation scope, inventoried for completeness |
| — (new) | — | `docs/README.md` canonical index; `docs/archive/README.md`; this inventory; `docs/migration/02-5-completion-report.md` |

## ARCHIVE (moved, banner added, content otherwise intact)
| From → To | Justification |
|---|---|
| `docs/phase-1-audit.md`, `phase-1-implementation.md`, `phase-2-audit.md`, `phase-3-audit.md`, `phase-4-audit.md`, `phase-4-capability-lifecycle.md`, `phase-completion-status.md` → `docs/archive/` | Dated phase reports with obsolete baselines (e.g. `phase-completion-status.md` cites checkout `aefe1af7`); superseded by Stage 00 baseline + phase-1 security doc. Retained for causal history; inbound links from `deployment.md`/`operations.md` updated |
| `docs/implementation-request-checklist.md` → archive | Original request list; fulfilled/superseded, historical value only |
| `docs/login-session-fix.md` → archive | One-off fix note; behavior now covered by auth tests |
| `docs/architecture/smart-tasks-review-and-plan.md` → archive | Review/plan whose implemented slice lives in `docs/deployment/smart-tasks-publication.md` (kept, link updated) |

## DELETE summary
No standalone document file was deleted. The only deleted material is the obsolete AI-Studio template content inside `frontend/README.md` (justified above). Everything classified DELETE-worthy by age alone was instead archived or labelled, per Stage 02.5 constraint 7.

## Counts
Before: 52 Markdown documents under `docs/`, plus 5 entry documents (root `TEST_GUIDE.md`, `backend/README.md`, `backend/AGENTS.md`/`CLAUDE.md`, `backend/audits/README.md`, `frontend/README.md`) — 57 product documents, excluding 39 tool-skill files. After: the same 57 (10 relocated into `docs/archive/`, 4 updated) plus 4 created files (`docs/README.md`, `docs/archive/README.md`, this inventory, the Stage 02.5 report) = 56 under `docs/`.
