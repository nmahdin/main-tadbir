# Stage C7-2 — Scoped Settings Inheritance, Authorized Mutations & Organization Override Policies — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `8aa72ce` (C7-1). Implementation head: `d4954d5`
(CI SUCCESS on push run `39107153025` + PR run `39107155992`;
this report commit follows). Date: 2026-10-18.

Code Complete: YES / Security Verified (within tested boundaries):
YES / Dev-CI Ready: YES / Production Operationally Ready: NO
(no settings HTTP APIs or UI yet — C7-4; secrets and history are
C7-3; production database/infrastructure untouched).

## 1. What was built (over the C7-1 registry/store — no second engine)

- `ScopedEffectiveSettingResolver` implements the C7-1
  `EffectiveSettingResolver` contract and is bound in
  `ModuleServiceProvider`. Resolution: User preference → Workspace
  override → Organization value → Platform default, each layer
  only where the definition permits. Read-only, uncached: an
  Organization change is visible in the very next resolution after
  commit, and nothing is ever materialized into Workspace rows.
- Persisted ownership always wins: with a Workspace in context the
  Organization is derived from the persisted Workspace row (a
  caller-passed Organization is never trusted); personal
  Workspaces skip the Organization layer entirely. `mandatory`
  definitions skip the User/Workspace layers (non-bypassable
  ceiling). Results distinguish absent vs explicit null
  (`has_explicit_value`) and carry safe source metadata
  (owner type/id, legacy flag) — never other tenants' data.
- `ScopedSettingService` — the only authorized mutation path:
  effective reads, scoped writes/removals (Organization, Workspace,
  actor-own User preferences), and per-key Organization override
  policies. Every mutation: operational-actor check → lock order
  Organization row → Workspace row → setting row → Organization
  lifecycle recheck under lock (suspended/ended deny everything,
  including Workspace writes beneath them and preferences are
  unaffected only because they are organization-independent) →
  persisted-membership permission → definition gates (registered,
  scope-eligible, non-secret, module state) → C7-1
  validation/normalization → expected-version check (absent = 0)
  → transactional write + safe audit in the SAME transaction (an
  audit failure rolls the mutation back). Audit summaries contain
  actor/scope/key/operation/version only — never values.
- Override policies are versioned and optimistic-checked
  (migration `2026_10_15_000016`, store-level check under the
  policy row lock): a missing policy reports the definition
  default (default-deny) with `explicit=false`, `version=null`.
  A denied policy makes the resolver ignore stored Workspace
  values — values are RETAINED and become effective again when
  the policy re-allows (write-time revalidation on every write).

## 2. Scoped authorization (C1–C3 catalog, no new authority plane)

- New narrow catalog keys `organization.settings.view/manage`,
  `workspace.settings.view/manage`. The generic legacy
  `organization.manage`/`workspace.manage` keys do NOT substitute.
- Protected Manager roles receive the new keys through the
  existing reviewed provisioning path (`RoleProvisioner` syncs the
  full scope catalog onto Manager roles on ensure); Members keep
  only the base view keys. No catalog-sync-only expansion for
  custom roles — they get settings authority only when an
  administrator explicitly grants it through role management.
- Authority comes exclusively from persisted scoped memberships
  via `MembershipPermissions`: Organization ownership labels,
  Platform Administrator status, and legacy admin role keys confer
  NOTHING (all three are test-proven denials); Organization
  membership never implies Workspace access (test-proven);
  preferences have no target-user parameter at all — the actor's
  own id is the only writable user scope.

## 3. Legacy public metadata transition (C6 compatibility)

- Canonical source after migration 000016: `core_setting_values`.
  The migration copies legacy `settings.public.description` /
  `logo_url` into canonical rows only where a definition exists
  and no canonical row exists (idempotent, non-destructive, never
  invents values; fresh databases simply have nothing to copy and
  the read fallback covers them). The legacy JSON is left intact
  and becomes a frozen read-fallback. `down()` drops only the
  added `policies.version` column; copied values are never deleted.
- Deterministic precedence implemented IDENTICALLY in the resolver
  and the C6 `InvitationPresenter` (canonical-first; an explicit
  canonical null means "intentionally cleared" and suppresses
  fallback), so C7 writes and C6 invitation presentation cannot
  diverge. Private organization settings still never surface.
  Exactly one writable source exists after this stage: the C7-2
  service; nothing writes the legacy JSON anymore.
- Note: `InvitationPresenter` now takes its `SettingValueStore`
  (a nullable-optional constructor silently stayed null under the
  container, which a temporary probe exposed and tests now lock
  in: parity tests assert presenter === resolver output).

## 4. Module & lifecycle boundaries

- Core settings are independent of module activation. A business
  module's settings are writable only while the module is
  catalog-Available and (Workspace scope) ENABLED on that
  Workspace; denied writes (`setting_module_disabled` /
  `setting_module_unavailable`) preserve stored values untouched.
- Organization suspension/termination overrides all settings
  access for that scope (reads unaffected elsewhere; user
  preferences are organization-independent by construction).
  Settings never grant operational data access — C4/C5 gates are
  untouched and unconsulted by design.
- Secrets are rejected by the generic path
  (`setting_secret_not_storable`); C7-3 owns protected storage.
  Stable service codes: `setting_forbidden`,
  `setting_organization_unavailable`, `setting_version_conflict`,
  `setting_override_denied`, `setting_module_disabled`,
  `setting_module_unavailable` (+ C7-1 validation codes).
- User preferences remain presentation-only (locale/timezone as
  registered); the service cannot target them at business rules,
  security, subscriptions, or permissions.

## 5. Concurrency (MySQL/InnoDB, committed postconditions)

`ScopedSettingsConcurrencyMysqlTest` (permanently wired into the
MySQL CI step) proves, with a second connection holding rows
mid-transaction: competing Organization writes serialize on the
documented Organization-row lock (loser: lock-wait 1205, winner's
version committed exactly once; stale expected-version then
rejected, current accepted); a committed suspension denies the
racing write with `setting_organization_unavailable` and leaves
no value/audit; policy expected-version is checked under the
policy row lock (creation expectation stale after the race,
current version accepted). No locks are held across HTTP or
external I/O (service has no such calls).

## 6. Verification

- New SQLite coverage: `EffectiveSettingsResolverTest` (defaults,
  inheritance, precedence, personal workspaces, persisted-owner
  wins, explicit null, policy suppression/retention, mandatory
  ceiling, legacy fallback/parity, no materialization) and
  `ScopedSettingServiceTest` (authorized writes + versions,
  member/outsider/legacy-admin/Platform denials, org≠workspace
  authority, policy versions/conflicts, suspended/ended denial,
  preference ownership, secret rejection, disabled/unavailable
  module denial with preservation, audit rollback, migration-000016
  copy idempotency + single-writable-source parity). Full
  C1–C7-1 regression in the same run.
- During CI bring-up, temporary annotation diagnostics found and
  fixed: a double-applied migration column, a racing-edit lost
  import, the container's nullable-optional presenter injection,
  and the missing `mysql_concurrent` test connection. All TEMP
  steps were removed; the workflow diff vs the C7-1 baseline is
  exactly one permanent line (the new MySQL test in the CI list).
- Final full CI SUCCESS at `d4954d5`: Pint, SQLite PHPUnit
  (complete suite), MySQL migration gate + concurrency list,
  frontend typecheck/tests/build.

## 7. Boundaries & next stages (not implemented, by design)

No settings HTTP APIs/React pages (C7-4), no secret storage or
reveal flows (C7-3), no history/restore APIs (C7-3), no new
modules/integrations, no production deployment, no plan or
entitlement changes. PR #14 remains open and unmerged;
`main`/production untouched.
