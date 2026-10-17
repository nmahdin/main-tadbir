# ADR-0005 — Legacy `workspace_records` Naming Collision
**Status:** ACCEPTED* (target direction, 2026-10-15; subject to OPEN questions) · Stage 01

## Context (CONFIRMED)
`workspace_records` / `App\Models\WorkspaceRecord` (kinds: idea, think-tank meeting, secretariat letter/resolution, archive dossier) and frontend `src/components/workspace/*`, `src/api/workspaceRecords.ts` predate the tenant-workspace concept. Introducing `workspaces` (ADR-0002) without renaming guarantees permanent ambiguity in code, queries, logs, and conversation. The word "Workspace" additionally means Google Workspace (`GoogleWorkspaceLink`).

## Decision (PROPOSED)
1. The tenant boundary is named exactly `workspaces` / `Workspace` (Core). No other new concept may use the word.
2. Legacy `WorkspaceRecord` is renamed when its module is migrated (Stage 05, Operational Records): model → `OperationalRecord`, table → `operational_records` (fresh schema in dev; JSON payload normalized per kind), internal APIs renamed accordingly. Existing **user-facing routes** (`/ideas`, `/secretariat-letters`, …) may stay stable if the frontend contributor prefers; the collision being removed is in domain naming, not URLs.
3. Frontend `components/workspace/*` (ActionDashboard, ApprovalCenter, …) is a UI naming matter for the frontend contributor; the backend contract simply stops sending `WorkspaceRecord` terminology. No visual redesign is implied.
4. `GoogleWorkspaceLink` keeps its name (it genuinely is Google Workspace) and is documented as an integration adapter to remove ambiguity.
5. Until the rename lands, all new Stage 01+ documents must write "legacy `WorkspaceRecord` (operational records)" on first use — never bare "workspace record" for the new concept.

## Consequences
One medium-sized, purely mechanical rename inside a Stage 05 module PR (tested by that module's regression suite). Rejecting the alternative (keeping the name) because search/log/authorization ambiguity is a recurring defect source, and the revised strategy explicitly permits replacing obsolete internal structures.
