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
| [0013](0013-subscription-lifecycle-v1.md) | Subscription lifecycle v1 (resolves Q-01) | PROPOSED |
| [0014](0014-platform-administration-scope.md) | Platform administration scope (resolves Q-10) | PROPOSED |
| [0015](0015-invitations-and-membership-acquisition.md) | Invitations and membership acquisition (resolves Q-08) | PROPOSED |
| [0016](0016-shared-core-services-files-notifications-audit.md) | Shared Core services: Files, Notifications, Audit | PROPOSED |
| [0017](0017-product-layering-and-solutions.md) | Product layering: Core, reusable modules, solutions, templates | PROPOSED |
| [0018](0018-cross-module-references-and-participants.md) | Cross-module references, aggregation, public participants | PROPOSED |
| [0019](0019-product-scope-updates-and-execution-priority.md) | Product-scope updates (catalog v1.4), execution priority, acceptance gates | ACCEPTED |
