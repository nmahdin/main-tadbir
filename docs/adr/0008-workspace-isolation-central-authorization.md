# ADR-0008 — Workspace Isolation and Centralized Authorization
**Status:** PROPOSED (workspace isolation mandatory: ACCEPTED) · Stage 01

## Context (CONFIRMED)
No Laravel Policies exist. Authorization = route `permission:` middleware (any-of) + ad-hoc access services per domain (`ContentAccess`, `ChatAccess`, `TaskOperations::visibleTo`, `Dam*Access`, Bale-side copies), with inconsistent record scoping: `AnalyticsController` aggregates the whole installation behind one permission, `GlobalSearchController` scopes some types and not others, activity feed masks by permission not membership. Stage 00 §4 lists 14 cross-boundary path groups, including the Bale bot, scheduled commands, signed DAM links, and Google sync.

## Decision (PROPOSED)
1. **One central authorization decision** in Core, evaluated for every operational operation in the order of `docs/architecture/core.md` §2.1 (active account → workspace resolution → membership(s) → single role permission → module activation/org policy/entitlement → resource-workspace match). Deny-by-default; a client-supplied `workspace_id` is never sufficient.
2. Implementation shape (Laravel-idiomatic): an authorization service + Policies/Gates backed by it, invoked from middleware *and* controllers *and* non-HTTP entry points (Bale handlers, artisan/scheduled commands, Google sync). Non-HTTP surfaces must call the same decision — parallel permission copies in adapters are prohibited (Bale's current `UserPermissionGate` copies are replaced, not extended).
3. Every query for operational data is workspace-scoped at the query level (scoped builders/global scopes with explicit bypass only inside Core platform administration, itself audited). Search, analytics, activity/audit feeds, exports, notifications, and file access are projections over the same scope — no separate unscoped read paths.
4. Cutover is per-module (Stage 04 proves one slice end-to-end; Stage 05 repeats). During coexistence, an unmigrated module keeps its legacy checks *unchanged* and is listed in the stage-status register with a removal criterion; migrated modules must not fall back to legacy checks. This coexistence concerns authorization checks only — never dual-written data.
5. Adversarial tests are part of the decision: cross-workspace ID tampering (IDOR), non-member org admin, deactivated membership mid-session, module-disabled and policy-denied cases, file/search/background variants — for every migrated slice (playbook Stage 06 acceptance).
6. Audit: role/membership/policy/subscription changes write to the Core audit log (ADR/Core §2), separate from the user-facing `activity_logs` feed (retained).

## OPEN
Q-09: signed temporary DAM link TTL and whether workspace revocation must invalidate outstanding links (links are stateless today; TTL unverified in Stage 00).

## Consequences
Deletes the per-service permission patchwork module by module. Until Stage 04, no existing behavior changes — which is precisely why the pre-existing A-series findings (security matrix) must be fixed or consciously carried, not assumed away.
