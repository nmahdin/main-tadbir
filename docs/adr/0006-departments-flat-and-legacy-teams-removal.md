# ADR-0006 — Flat Workspace Departments; Legacy Teams Removal
**Status:** PROPOSED · Stage 01

## Context (CONFIRMED)
`departments` has a self-referencing `parent_id` hierarchy (+ frontend `departmentHierarchy.ts`), a `manager_id`, `legacy_team_id`, and a `department_user` pivot with a free-text `role`. Legacy `teams`/`team_user`/`dam_data_table_team` tables still exist with no Eloquent model, behind the `DepartmentConsolidation` runtime phase gate (`system_settings` key; `EnsureDepartmentStructure` middleware rejects most traffic until consolidation completes; the migration's `down()` intentionally throws). Playbook rule 8: departments optional and **flat** in v1, **no team entity, no nested hierarchy**.

## Decision (PROPOSED)
1. Target department: belongs to exactly one **workspace**, flat (no `parent_id`), optional. Membership is a plain workspace-scoped pivot (user may be in zero/one/many departments of that workspace). Department manager is an attribute of the department, not an authorization scope.
2. Departments never act as a data-isolation boundary; where legacy code granted access via department membership (e.g. `ContentAccess` department scoping over JSON payload IDs), that behavior is re-expressed as explicit module rules during Stage 05 or deleted — it is not carried into workspace RBAC (ADR-0004).
3. **Removal, not consolidation (revised strategy):** in disposable dev databases the schema simply drops `departments.parent_id`, `users.department_id`, `department_user.role`, `teams`, `team_user`, `dam_data_table_team`, and the `DepartmentConsolidation` service/gate/middleware once no code reads them. No in-place conversion of dev data.
4. Frontend hierarchy utilities become obsolete with the flat model — functional removal coordinated with the frontend contributor in the Departments slice of Stage 05; no visual redesign.

## OPEN
Q-07: is a "primary department" flag still needed for analytics (today `AnalyticsController` defines membership as the primary department)? If yes, it becomes an explicit pivot boolean in the target schema; if no, the analytics definition is rewritten in Stage 05.

## Consequences
Deletes a whole class of transitional machinery (consolidation phases, team-ID rejection middleware). Any non-disposable database falls back to roadmap §3 (the existing consolidation service then becomes an input, not the strategy).
