# Architecture Decision Records (ADR)

Status vocabulary: **PROPOSED** = recommended in Stage 01, binding only after explicit human approval of the Stage 01 PR; **ACCEPTED** = already mandated by the approved playbook / user's revised strategy; **OPEN** = no decision taken, implementing stages must not invent one. Every ADR separates CONFIRMED repository facts from proposals. Full register: `docs/migration/decisions-and-open-questions.md`.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith-boundaries.md) | Modular monolith boundaries and module ownership | PROPOSED (style itself ACCEPTED by playbook) |
| [0002](0002-organization-workspace-ownership.md) | Organization, personal & organizational workspace ownership | PROPOSED |
| [0003](0003-organization-vs-workspace-membership.md) | Organization membership vs workspace membership | PROPOSED |
| [0004](0004-workspace-rbac-and-legacy-role-replacement.md) | Workspace-scoped RBAC; legacy role replacement | PROPOSED |
| [0005](0005-workspace-records-naming-collision.md) | Legacy `workspace_records` naming collision | PROPOSED |
| [0006](0006-departments-flat-and-legacy-teams-removal.md) | Flat workspace departments; legacy teams removal | PROPOSED |
| [0007](0007-legacy-installation-mapping-and-dev-resets.md) | Legacy installation → organization/workspace; dev DB resets | PROPOSED (reset authorization rule ACCEPTED) |
| [0008](0008-workspace-isolation-central-authorization.md) | Workspace isolation and centralized authorization | PROPOSED (isolation itself ACCEPTED) |
| [0009](0009-mysql-sqlite-compatibility-ownership-constraints.md) | MySQL/SQLite compatibility and ownership constraints | PROPOSED, partly OPEN (prod MySQL UNKNOWN) |
| [0010](0010-subscriptions-entitlements-module-activation.md) | Subscriptions, entitlements, module activation boundaries | PROPOSED, lifecycle OPEN |
| [0011](0011-background-processing-shared-hosting.md) | Background processing on shared hosting | PROPOSED |
| [0012](0012-code-quality-and-project-structure.md) | Code quality, project structure, enforceable standards | PROPOSED (quality gates ACCEPTED as mandatory) |
