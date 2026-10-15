# Architecture Decision Records (ADR)

Status vocabulary: **ACCEPTED*** = accepted as target direction by the reviewer on 2026-10-15 (subject to documented OPEN questions and corrections); **ACCEPTED** = mandated by the playbook / user instruction; **PROPOSED** = not yet decided; **OPEN** = undecided, implementing stages must not invent one. Every ADR separates CONFIRMED repository facts from proposals. Full register: `docs/migration/decisions-and-open-questions.md`.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-boundaries.md) | Modular monolith boundaries and module ownership | ACCEPTED* |
| [0002](0002-organization-workspace-ownership.md) | Organization, personal & organizational workspace ownership | ACCEPTED* |
| [0003](0003-organization-vs-workspace-membership.md) | Organization membership vs workspace membership | ACCEPTED* |
| [0004](0004-workspace-rbac-and-legacy-role-replacement.md) | Workspace-scoped RBAC; legacy role replacement | ACCEPTED* |
| [0005](0005-workspace-records-naming-collision.md) | Legacy `workspace_records` naming collision | ACCEPTED* |
| [0006](0006-departments-flat-and-legacy-teams-removal.md) | Flat workspace departments; legacy teams removal | ACCEPTED* |
| [0007](0007-legacy-installation-mapping-and-dev-resets.md) | Legacy installation → organization/workspace; dev DB resets | ACCEPTED* |
| [0008](0008-workspace-isolation-central-authorization.md) | Workspace isolation and centralized authorization | ACCEPTED* |
| [0009](0009-mysql-sqlite-compatibility-ownership-constraints.md) | MySQL/SQLite compatibility and ownership constraints | ACCEPTED* |
| [0010](0010-subscriptions-entitlements-module-activation.md) | Subscriptions, entitlements, module activation boundaries | ACCEPTED* |
| [0011](0011-background-processing-shared-hosting.md) | Background processing on shared hosting | ACCEPTED* |
| [0012](0012-code-quality-and-project-structure.md) | Code quality, project structure, enforceable standards | ACCEPTED* |
