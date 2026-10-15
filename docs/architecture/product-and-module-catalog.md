# Product & Module Catalog — TADBIR Comprehensive (canonical)

- **Status:** PROPOSED (product-alignment design stage, code baseline `7b90a73`). This is the single canonical catalog of product families, modules, and solutions. It implements no code; it constrains how Core v1 (`core-v1-specification.md`) is completed and how business modules are later built. Module IDs below are the stable identifiers used by manifests, permission catalogs, entitlements, and activation.
- **Rule:** Core contains no business-module logic. A capability used by two or more product areas is a **reusable business module**; a capability meaningful to one domain is a **specialized solution module**; presentation bundling is a **solution template/composition**, never a data-owning module.

## 1. Product families

| Family | Promise | Primary workspace kind |
|---|---|---|
| **Personal OS** | One person's tasks, planning, calendar, goals, habits, notes, personal finance, productivity | Personal workspace(s) owned by the user |
| **Organization OS** | Team/org operations: projects, tasks, meetings, finance, CRM, HRM, procurement, content, workflows | Organizational workspaces |
| **Specialized Solutions** | Packaged domain solutions built from reusable modules + domain-specific logic: events, competitions, challenges, surveys, media operations, campaigns | Either kind; usually a dedicated organizational workspace per engagement (§4) |

Future areas (inventory, physical assets, contracts, advanced correspondence, education/LMS, courses, e-commerce, advanced accounting) are **catalog placeholders only** — names reserved below, not designed or implemented in Core v1.

## 2. Platform Core (not a product module)

Identity & accounts · organizations & workspaces · memberships & invitations · scoped RBAC & central authorization · platform administration · plans/subscriptions/entitlements/quotas · module registration & activation · scoped settings · Files Core · notifications · audit · domain events/background ticks. Specified in `core-v1-specification.md`; status in `core-capability-matrix.md`. Core exposes contracts; it never imports a business module.

## 3. Reusable business modules (shared across families/solutions)

Each owns its tables, permission keys (`<module>.*`), events, and workspace-scoped records (`workspace_id` NOT NULL once migrated). A record exists **exactly once**, in its owning module and workspace; other modules reference it (§5 of `cross-module-contracts.md`) — never copy it.

| Module ID | Owns (domain) | Used by (examples) | Core v1 status |
|---|---|---|---|
| `projects` | Projects, project membership, templates, content plans | Organization OS, Media Ops, Events | **Pilot-migrated (04B)** — reference implementation |
| `tasks` | Tasks, assignments, checklists, automations | All families, all solutions | Legacy in use; migration post-Core |
| `calendar` | Events/appointments, recurrence, reminders | Personal OS, Organization OS, Events | Legacy fragments (Google links); design post-Core |
| `content` | Content items, series, editorial workflow | Organization OS, Media Ops, Campaigns | Legacy in use; migration post-Core |
| `dam` | Media assets, libraries, versions (on Files Core) | Media Ops, Content, Events, Campaigns | Legacy in use; migration post-Core |
| `finance` | Financial records, budgets, invoices/expenses (records, not accounting engine) | Organization OS, Events, Personal OS (personal finance profile) | Not started |
| `crm` | Contacts, organizations-as-contacts, interactions, pipelines | Organization OS, Events, Competitions | Not started |
| `forms` | Form definitions, questions, responses (the shared question-and-response engine) | Surveys, Competitions, Events (registration), HRM | Not started |
| `workflows` | Approval/flow definitions and runs over other modules' records | Organization OS, Events, Procurement | Not started |
| `meetings` | Meeting records, agendas, minutes, decisions | Organization OS | Legacy fragments (operational records) |
| `notes` | Notes and knowledge pages | Personal OS, all | Not started |
| `goals` | Goals, habits, reviews | Personal OS | Not started |
| `operational-records` | Ideas, letters, dossiers (renamed WorkspaceRecord per ADR-0005) | Organization OS (secretariat) | Legacy in use; migration post-Core |
| `chat` | Conversations and messages | All families | Legacy (domain_records); migration post-Core |
| `reporting` | Workspace-scoped search, analytics, dashboards data | All | Legacy endpoints firewalled (04B); scoped rebuild post-Core |

## 4. Specialized solution modules (domain logic on top of reusable modules)

| Solution ID | Domain-specific owns | Reuses | Notes |
|---|---|---|---|
| `events` | Event programs, sessions, registrations, speakers, venues | tasks, calendar, forms, finance, crm, content, dam, workflows | Registration uses `forms`; money stays in `finance` |
| `competitions` | Competitions, entries, judging, ranking, awards | forms (submission engine), tasks, dam, finance | Judging/ranking are domain-specific — never in `forms` |
| `challenges` | Challenge definitions, participation, leaderboards | forms, goals, tasks | |
| `surveys` | Survey campaigns, distribution, analysis views | forms | A survey is a `forms` instrument + campaign wrapper |
| `media-ops` | Editorial planning, production pipeline views | content, dam, tasks, calendar, projects | Mostly composition + a small domain layer |
| `campaigns` | Campaign briefs, channels, deliverable tracking | content, dam, tasks, finance, crm | |

**Solution templates** = versioned, data-only bundles (module activation set, default roles/permissions selection, dashboard composition, starter settings, seeded reference structures like form templates). They are applied to a workspace at creation/enablement time, are owned by Core's module-activation slice as *configuration*, and own no records and no code paths. Applying a template never copies another workspace's data.

## 5. Coexistence and workspace topology rules

1. **Multiple solutions in one workspace:** solutions are module-activation + composition over the same workspace. All records stay single-sourced in their owning module with that workspace's `workspace_id`; cross-references use the reference contract (`cross-module-contracts.md` §2). Dashboards compose read models at request time — no duplicated records, no per-solution copies.
2. **Independent workspace when:** membership sets differ, confidentiality boundaries differ (e.g. a client's event vs internal operations), billing/ownership differs, or retention differs. Workspace is the security boundary — if in doubt, separate workspaces, because cross-workspace sharing is not a v1 feature.
3. **Personal dashboard aggregation:** the personal dashboard is a composition surface, not a data store. It queries each workspace the user can access **through that workspace's own authorization context** (per-workspace fan-out, server-side) and renders authorized summaries/links. Nothing is copied into the personal workspace; losing membership in a workspace removes its data from the dashboard on the next request; confidential fields are only shown at the detail level the source workspace's permissions allow (aggregation contract, `cross-module-contracts.md` §4).

## 6. External portals and integrations

- **Public portals** (event pages, survey links, competition entry pages) are *presentation surfaces over module contracts*, authenticated as **public participants** (not workspace members) — see contract §5. They never receive workspace contexts.
- **Integrations** (Bale, Google, future webhooks/API clients) are adapters with scoped service identities (contract §6): they call module `Contracts/` and the central authorization decision; they hold no permission copies and no direct table access.
- Future catalog placeholders (no v1 design): `inventory`, `assets`, `contracts`, `correspondence`, `lms`, `courses`, `commerce`, `accounting-advanced`. Reservation of an ID here prevents naming collisions only.
