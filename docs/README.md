# TADBIR Documentation Index

**This is the canonical entry point.** One authoritative document per topic; anything not listed here (or listed as historical) must not be treated as a current specification. Established in Stage 02.5 (2026-10-15); full disposition of every document: `migration/documentation-inventory.md`.

## Architecture & decisions (authoritative)
| Topic | Canonical document |
|---|---|
| Target Core architecture (Stage 01 record) | [architecture/core.md](architecture/core.md) |
| **Core v1 Architecture Specification (design freeze candidate)** | [architecture/core-v1-specification.md](architecture/core-v1-specification.md) |
| Core Capability Matrix (implemented / partial / missing / deferred) | [architecture/core-capability-matrix.md](architecture/core-capability-matrix.md) |
| Core Data Model & Schema Plan | [architecture/core-data-model.md](architecture/core-data-model.md) |
| Authorization & Entitlement Decision Specification | [architecture/authorization-entitlement-decision.md](architecture/authorization-entitlement-decision.md) |
| Core Design Review Report (contradictions, risks, OD-1…OD-11 approvals) | [architecture/core-design-review-report.md](architecture/core-design-review-report.md) |
| Product-Owner Approval Sheet (one page, OD-1…OD-11) | [architecture/product-owner-approval-sheet.md](architecture/product-owner-approval-sheet.md) |
| Central authorization engine (as built, Stage 04A/04B) | [architecture/central-authorization.md](architecture/central-authorization.md) |
| Core v1 Completion Roadmap (C1–C9) | [roadmap/core-v1-completion-roadmap.md](roadmap/core-v1-completion-roadmap.md) |
| Product & Module Catalog (families, modules, solutions, future IDs) | [architecture/product-and-module-catalog.md](architecture/product-and-module-catalog.md) |
| Cross-Module Contracts (references, aggregation, participants, service identities) | [architecture/cross-module-contracts.md](architecture/cross-module-contracts.md) |
| Modular foundation as built (Stage 02) | [architecture/modular-foundation.md](architecture/modular-foundation.md) |
| Architecture decisions (ADR-0001…0012) | [adr/README.md](adr/README.md) |
| Decision register & open questions | [migration/decisions-and-open-questions.md](migration/decisions-and-open-questions.md) |
| Coding standards (mandatory gates) | [CODING_STANDARDS.md](CODING_STANDARDS.md) |
| Project structure & refactoring strategy | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) |
| Migration roadmap (Stages 02–08) | [roadmap/migration-to-tadbir-comprehensive.md](roadmap/migration-to-tadbir-comprehensive.md) |
| Migration stage status | [migration/stage-status.md](migration/stage-status.md) |

## Product / domain documentation (current)
| Topic | Document |
|---|---|
| Bale bot contract & operations | [bale-bot.md](bale-bot.md) (+ [deployment/bale-webhook.md](deployment/bale-webhook.md), [deployment/bale-menus-and-automations.md](deployment/bale-menus-and-automations.md), [deployment/bale-experience.md](deployment/bale-experience.md)) |
| Digital asset management (DAM) | [dam-architecture.md](dam-architecture.md) |
| Chat & comments data boundaries | [architecture/chat-and-comments.md](architecture/chat-and-comments.md) |
| Google Workspace integration | [google-workspace.md](google-workspace.md) |
| Seeders | [seeders.md](seeders.md) |
| Username (email-less) accounts | [username-accounts.md](username-accounts.md) |
| UI standards (owned by the frontend contributor) | [ui-standards.md](ui-standards.md) |
| Backend runbook (Laravel API) | [../backend/README.md](../backend/README.md) |
| Frontend runbook | [../frontend/README.md](../frontend/README.md) |
| Manual test guide | [../TEST_GUIDE.md](../TEST_GUIDE.md) |

## Operations, deployment & security (current — do not archive casually)
| Topic | Document |
|---|---|
| Deployment (shared host, no SSH/Cron) | [deployment.md](deployment.md) + [deployment/](deployment/) guides and `*.mysql.sql` host patches (paths are referenced from application code — do not move) |
| Environment files | [environment.md](environment.md) |
| Operations (backup/scheduler unknowns) | [operations.md](operations.md) |
| Access-control audit & phase-1 fixes | [security/access-control-review.md](security/access-control-review.md), [security/access-control-phase1.md](security/access-control-phase1.md) |
| A01–A16 current status matrix | [migration/security-audit-status.md](migration/security-audit-status.md) |
| Generated inventories (snapshot 2026-09-28, **not authoritative**) | `security/route-inventory.csv`, `security/permission-inventory.csv`, `security/inventory-summary.json` — regenerate with `python3 scripts/audit-permissions.py` (needs a PHP route dump for routes) |

## Migration programme records
[00 audit](migration/00-current-state-audit.md) · [01 report](migration/01-stage-01-completion-report.md) · [02 report](migration/02-stage-02-completion-report.md) · [02.5 report](migration/02-5-completion-report.md) · [disposition inventory](migration/retain-refactor-replace-remove.md) · [documentation inventory](migration/documentation-inventory.md)

## Historical archive (valuable, never authoritative)
[archive/](archive/) — phase 1–4 audits/implementations (2026-09-29/30), phase completion status, implementation-request checklist, login-session fix, smart-tasks review. Start from the canonical documents above; use the archive only to understand *why* current code looks as it does.

## Tooling notes
`../backend/AGENTS.md` and `../backend/CLAUDE.md` are identical Laravel Boost guideline entry points for AI tools (kept deliberately for both tools); `../backend/.agents/skills/` are tool skills, not product documentation. `../backend/audits/README.md` documents the opt-in A-series audit suite (`../backend/audits/AccessControlAuditTest.php`).
