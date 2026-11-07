# ADR-0007 — Legacy Installation Mapping and Development Database Resets
**Status:** ACCEPTED* (target direction, 2026-10-15; reset-authorization rule already binding)

## Context (CONFIRMED)
User clarification (2026-10-15): TADBIR is under active development; no important production data must be preserved. The Stage 00 audit nonetheless recorded production-hosting artifacts (domains in `.env.example`, manual `.mysql.sql` patches), so *some* installed database may exist whose disposability only the project owner can judge.

## Decision (PROPOSED)
1. **Default data path is recreation, not migration:** disposable development databases are dropped/recreated, migrated fresh, and seeded (platform admin, demo organization + default workspace, personal default workspaces, protected roles, demo business data via seeders/factories). There is no legacy backfill, dual-write, or compatibility adapter under the revised strategy.
2. **If** a specific database is converted instead of reset, its single-tenant installation maps deterministically to: one `Organization` (name/settings from `OrganizationSettings`), one default organizational workspace owning all operational records, organization memberships for all active users, and workspace memberships whose roles are chosen by an explicit human-reviewed mapping (never guessed per record — Stage 00 R-01). This paragraph is a contingency, not the plan.
3. **Reset authorization (binding now):** a reset = drop + recreate a *named* database + `migrate:fresh` + seed. It requires explicit human authorization naming the environment, every time. Shared/staging/production databases are never reset on agent initiative, even if believed unimportant (revised-strategy rule 9). The agent does not connect to non-local databases.
4. Recommended reset points: Stage 03 (Core schema), optionally per-module in Stage 05 (Operational Records, Chat payload normalization), Stage 08 (fresh-install rehearsal). Each stage PR states whether a reset is requested; silence means *no reset*.
5. Before resetting anything others might use, the stage PR records the owner's confirmation of disposability. Seed data must never contain real credentials or real user records.

## Consequences
Removes the playbook's Stage 04 (dry-run backfill/exception register) from the critical path. Risk retained: accidentally assuming a valued database is disposable — mitigated only by rule 3, which is why it is ACCEPTED rather than proposed.
