# Product & Module Catalog v1.3 — TADBIR Comprehensive (canonical)

- **Status:** PROPOSED (design-correction stage, code baseline `7b90a73`). This is the authoritative product-requirements baseline for capability inventory: **24 current/planned capability areas** and **14 future/deferred areas**, mapped in §4 to exactly one disposition each. It implements no code.
- **Counting rule (corrected):** capability areas are *product* concepts, not modules. The catalog resolves to **16 independent reusable modules, 6 specialized domain modules**, plus features-inside-modules and compositions (§4). Earlier drafts that implied a "14 reusable modules" count or treated Reporting/Media Operations as record-owning modules are superseded by this document.
- **Stability rule:** module IDs already established (`projects`, and the Core catalog keys) never change; new IDs below are reserved by this catalog to prevent collisions.

## 1. Product families
| Family | Capability emphasis | Workspace kind |
|---|---|---|
| **Personal OS** | Planning, tasks, calendar, goals, habits & routines, notes, personal finance | Personal workspace(s) |
| **Organization OS** | Projects, tasks, meetings, finance, CRM, HRM, procurement, content, workflows, ideas & innovation | Organizational workspaces |
| **Specialized Solutions** | Events, competitions, challenges, surveys, campaigns, media operations — composed from reusable modules + domain logic | The organization's existing workspace(s) by default; an independent workspace is chosen when membership, confidentiality, billing, or retention boundaries differ (§5) |

## 2. The 24 current/planned capability areas
1. Projects · 2. Tasks · 3. Planning (distinct capability from Tasks and Calendar: horizons, scheduling, roadmaps over tasks/calendar) · 4. Calendar · 5. Goals · 6. Habits & Routines (distinct from Goals: recurring behavior + streaks vs outcome targets) · 7. Notes · 8. Finance with **two profiles** — Personal Finance (single-owner budgets/accounts, no approvals) and Organizational Finance (multi-actor records, budgets, approvals) over one record engine · 9. CRM · 10. HRM (people operations layered over Core memberships; never owns identity) · 11. Procurement · 12. Meetings · 13. Content · 14. DAM / Media Library · 15. Workflows · 16. Forms & Responses · 17. Chat & Comments · 18. Ideas & Innovation (evolution of the legacy Operational Records "ideas" kind; secretariat letters/dossiers remain separate record kinds in the same module) · 19. Reporting & Dashboards · 20. Events · 21. Competitions · 22. Challenges & Surveys (two solutions, one forms-driven engagement pattern) · 23. Campaigns · 24. Media Operations.

## 3. The 14 future/deferred areas (ID reservation only — no design, no implementation)
Inventory · Physical Assets · Contracts · Advanced Correspondence · Commerce (storefront/e-commerce) · Training Courses · LMS · Education/Institution Management · Assessments · Certificates · Advanced Accounting · Payroll · Helpdesk & Support · Advanced BI/Analytics. Education, training courses, LMS, assessments, certificates and commerce are **explicitly deferred beyond Core v1 and beyond the first product stages**.

## 4. Traceability matrix — every capability, exactly one disposition
Dispositions: **(1)** independent reusable module · **(2)** specialized domain module · **(3)** feature within a named module · **(4)** solution/dashboard composition · **(5)** deferred future capability.

| # | Capability area | Disposition | Module / location | Boundary notes |
|---|---|---|---|---|
| 1 | Projects | 1 | `projects` (pilot-migrated 04B) | Owns projects, project membership, templates, content plans |
| 2 | Tasks | 1 | `tasks` | Owns tasks/assignments; at most one owning project per task (contracts §7) |
| 3 | Planning | 3 | Feature within `tasks`, consuming `calendar` | Owns no records beyond plan views/horizons over tasks & calendar entries; distinct capability surface, no separate store |
| 4 | Calendar | 1 | `calendar` | Entries may reference one subject record |
| 5 | Goals | 1 | `goals` | Outcome targets & reviews; may reference habits, never tracks streaks |
| 6 | Habits & Routines | 1 | `habits` | Recurrence, check-ins, streaks; referenced by goals/dashboards |
| 7 | Notes | 1 | `notes` | Personal & workspace notes/pages |
| 8a | Personal Finance | 3 | Profile/feature within `finance` | Personal-workspace context only; simplified categories, no approvals/multi-actor workflow |
| 8b | Organizational Finance | 1 | `finance` | Financial records, budgets; displayed elsewhere only via contract aggregates |
| 9 | CRM | 1 | `crm` | Contacts/pipelines; people here are not user identities |
| 10 | HRM | 1 | `hrm` | Employee records reference Core users/memberships; leave/onboarding over `workflows` |
| 11 | Procurement | 2 | `procurement` | Domain flow over `crm` (vendors), `finance`, `workflows` |
| 12 | Meetings | 1 | `meetings` | Agendas/minutes/decisions; may reference tasks (action items) |
| 13 | Content | 1 | `content` | Editorial workflow, series |
| 14 | DAM / Media Library | 1 | `dam` (on Files Core) | Asset semantics; storage mediated by Core Files |
| 15 | Workflows | 1 | `workflows` | Flow definitions/runs over other modules' records via references |
| 16 | Forms & Responses | 1 | `forms` | The shared question-and-response engine for surveys, registration, competition submissions |
| 17 | Chat & Comments | 1 | `chat` | Conversations; record comments exposed as a chat-owned service to other modules |
| 18 | Ideas & Innovation | 3 | Feature within `operational-records` | Idea pipeline evolves the legacy WorkspaceRecord ideas kind; letters/dossiers stay distinct kinds in the same module (ADR-0005) |
| 19 | Reporting & Dashboards | 4 | `reporting` composition layer | Owns no operational records; composes contract read models; saved layouts are user/org settings, not records |
| 20 | Events | 2 | `events` | Programs/registrations/sessions over tasks, calendar, forms, finance, crm, content, dam, workflows |
| 21 | Competitions | 2 | `competitions` | Judging/ranking/awards domain logic over `forms`, `dam`, `finance` |
| 22 | Challenges | 2 | `challenges` | Participation/leaderboards over `forms`, `goals`, `habits`, `tasks` |
| 22 | Surveys | 2 | `surveys` | Campaign/distribution/analysis wrapper over `forms` (thin; owns no response engine) |
| 23 | Campaigns | 2 | `campaigns` | Briefs/channels/deliverables over `content`, `dam`, `tasks`, `finance`, `crm` |
| 24 | Media Operations | 4 | Solution composition (+ template) | Editorial pipeline views over `content`, `dam`, `tasks`, `calendar`, `projects`; owns no records |

**Future areas (all disposition 5):** inventory, physical-assets, contracts, advanced-correspondence, commerce, training-courses, lms, education, assessments, certificates, advanced-accounting, payroll, helpdesk, advanced-bi — IDs reserved, nothing designed.

**Counts (authoritative):** reusable modules = `projects, tasks, calendar, goals, habits, notes, finance, crm, hrm, forms, workflows, meetings, content, dam, chat, operational-records` (**16**). Specialized domain modules = `events, competitions, challenges, surveys, campaigns, procurement` (**6**). Features = planning (in `tasks`), personal finance (in `finance`), ideas & innovation (in `operational-records`). Compositions = reporting/dashboards, media operations, personal dashboard, solution templates.

## 5. Composition and topology rules (unchanged principles)
- Platform Core (§2 of `core-v1-specification.md`) contains no business logic; solutions compose reusable modules in one workspace with single-sourced records and references (`cross-module-contracts.md`); separate confidentiality/membership/billing boundaries ⇒ separate workspaces.
- Solution templates are data-only bundles (activation set, ceiling-checked role selections, dashboard composition, starter structures) — they own no records and grant no privilege beyond the activator's authority and the subscription/organization policy (spec §F, contracts §8).
- External portals are presentation surfaces over module contracts for public participants (contracts §5), never workspace sessions.
- **Organization finance reporting (disposition):** finance records are workspace-scoped and are never linked, copied, or aggregated across workspaces implicitly. Organization membership alone grants **no** financial visibility: seeing a workspace's finance data requires that workspace's membership plus `finance.view` in it. A permission-checked cross-workspace finance summary for organization dashboards is **not part of Core v1**; whether it is ever supported (and under which org-level finance permission) is an open product decision (OD-12) for the Finance/Reporting design stage. Until then, finance dashboards operate strictly per workspace.
