# Cross-Module Contracts (Core v1 design)

- **Status:** PROPOSED (product-alignment design stage, baseline `7b90a73`). These are minimal contracts — deliberately **not** a universal entity framework. Each contract exists because a named, recurring need crosses module boundaries (catalog §3–§5). Implementation follows the C-stages and module migrations; nothing here is code yet beyond the 04A/04B pieces marked CONFIRMED.

## 1. Record ownership and workspace scoping (CONFIRMED foundation)
- Every operational record belongs to exactly one module and exactly one workspace (`workspace_id` NOT NULL after its module's migration; the 04B pilot carries the transitional nullable form).
- Modules expose the `WorkspaceOwned` contract (`workspace()` relation, `forWorkspace`/`forContext` scopes) via the `ScopesToWorkspace` trait (Stage 04A, CONFIRMED) and authorize through `AuthorizationService` with their own module id and catalog keys.
- Lists, detail, mutation, search, export, aggregation, files, notifications, and jobs all scope by the resolved context server-side; foreign ≡ missing (404). Legacy surfaces that cannot yet scope must firewall workspace-owned records out (04B analytics pattern) until migrated.

## 2. Cross-module record references
- A reference is a **typed pointer, not a copy**: (`owner_module`, `record_type`, `record_id`) plus, for integrity, the `workspace_id` of the target — stored on the referencing record or in the owning module's link table (the Files `file_links` shape is the reference implementation pattern).
- **Rules:** (a) writer validates at write time that the target exists *in the same workspace* (cross-workspace references are rejected 422, the 04B content-plan/series pattern generalized); (b) readers resolve references only through the target module's `Contracts/` read API, which re-authorizes — a stored reference never grants access; (c) target deletion is governed by the target module (restrict or explicit unlink), never by silent cascade across modules; (d) references never carry copied display fields as a source of truth — display data is fetched live so revocation and edits propagate.
- Module `Contracts/` expose narrow read models (id, title, status, workspace, permission-checked summary), never Eloquent models of another module.

## 3. Related-resource contracts (named pairs; all follow §2)
- **Tasks ↔ anything:** a task may link to one primary subject (project, content item, event, finance record…) via the reference pointer; the Tasks module owns the link; subject modules expose a `relatedTasks` contract query (workspace-checked) used by project/event dashboards without joining Tasks tables.
- **Content ↔ DAM:** content references DAM assets via `file_links`-style references mediated by Files Core; download authorization follows the *content's* workspace/permission at follow time.
- **Finance ↔ dashboards:** finance owns financial records; events/projects/organizations reference finance records; dashboards display **aggregates obtained through the Finance contract** (sums by reference/context) — finance rows are never duplicated into the referencing module, and visibility of amounts follows the Finance module's own permission keys (a project viewer does not automatically see amounts — contract returns `restricted` placeholders when the actor lacks `finance.view`).
- **Forms ↔ solutions:** forms owns definitions/questions/responses; competitions/surveys/events own their domain wrappers (entry/judging/registration) referencing a form definition + response set; response data is read through the Forms contract with the solution's permission check on top.
- **Calendar ↔ modules:** calendar entries may reference one subject record; reminders are notifications produced via Core Notifications.

## 4. Solution & dashboard aggregation contract
- Aggregation is a **read composition**, computed per request: for each source, the composer resolves the actor's context *for that source's workspace* and calls module contract queries scoped to it; results merge in memory; nothing persists except optional per-user widget preferences (user-scope settings).
- **Personal dashboard** = composition across all workspaces where the actor has active membership (plus their personal workspace), using the above per workspace. It must not copy, cache server-side beyond request lifetime, or display fields the source context denies; counts/summaries inherit the strictest applicable permission of their source module.
- **Solution dashboards** (event/project/organization) aggregate within one workspace across modules using §3 contracts; cross-module joins in SQL are prohibited — composition happens in the application layer over contract results, each already authorized.
- Workspace reporting (`reporting` module) is the scoped evolution of today's firewalled legacy analytics; installation-wide aggregates over workspace-owned records remain prohibited.

## 5. Public participants vs workspace members
- **Workspace members** act through memberships + scoped roles (the only path to operational data).
- **Public participants** (event registrants, survey respondents, competition entrants, portal viewers) are *module-owned identities*: e.g. an Events `participants` record or a Forms respondent token — scoped to one engagement (one event/form/competition), holding only the data that engagement collected. They have no workspace membership, no role, and no access beyond their engagement's public contract (submit/view-own-submission with a capability token). Participant→member promotion is explicit (a member invites/registers the same person; records link by an explicit module action, never by email matching alone).
- Public endpoints are rate-limited, capability-token based, and cannot enumerate workspace data (IDs are not authorization).

## 6. External service identities and scoped integrations
- An integration acts as a **service identity**: (integration id, linked platform/workspace scope, granted contract permissions) — e.g. Bale user links, Google workspace links, future API tokens scoped per workspace by a Workspace Manager.
- Rules: adapters authenticate the external actor, map to a platform `users` row where the integration is user-facing (Bale/Google pattern) or to a scoped service identity for system flows; every action re-runs the central decision (for user flows) or checks the service identity's granted contract scopes (for system flows); revocation = deleting the link/grant, effective immediately; adapters store no permission copies and write only through module `Contracts/`.
- Outbound integrations (webhooks) are events (§J of the spec) with signed payloads and tick-based retry; payload minimization: references + change summaries, not record dumps.

## 7. Explicit non-goals
No universal entity supertable, no generic EAV record store, no cross-module SQL joins, no shared mutable models between modules, no event-sourced rewrite of module internals. Duplication is avoided by references + live contract reads, not by merging modules' data.
