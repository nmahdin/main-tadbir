# Stage C7-3 — Scoped Settings Secrets, Immutable History & Per-Key Restore — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `5f4781f` (ARCH-01; C7-2 `2f4b617` verified reachable
in its ancestry). Implementation head: `ad9991d` (CI SUCCESS on
push run `39120100011` + PR run `39120102988`; this report commit
follows). Date: 2026-10-18.

Code Complete: YES / Security Verified (within tested boundaries):
YES / Dev-CI Ready: YES / Production Operationally Ready: NO
(no settings HTTP APIs/UI yet — C7-4; production untouched).

## 0. Baseline reconciliation & GitGuardian triage

- `git merge-base --is-ancestor` verified for both `2f4b617`
  (C7-2) and `5f4781f` (ARCH-01) at HEAD; local = remote =
  `5f4781f` before editing. ARCH-01 delivered structure
  (domain migration paths incl. empty
  `app/Core/Settings/Database/{Migrations,Seeders}`, `DomainPaths`,
  modular routes, seed commands, `src/features/invitations`)
  and the C7-2 resolver/service/000016/presenter behavior were
  re-inspected before changes. This stage's baseline CI was the
  green ARCH-01 final run; the focused regression is the full CI
  suite on every push.
- **GitGuardian alert (PR #14, `InvitationOnboardingActivationTest.php`):
  FALSE POSITIVE for real exposure — a dummy test fixture.** The
  flagged content is a hardcoded weak password literal used only
  to create throwaway factory users and immediately log in as
  them inside the test process (plus `@example.com` fixture
  addresses; long "literals" elsewhere are API paths). No real
  credential, no production account, no reuse anywhere else.
  Disposition: the literal was removed anyway as hygiene (tests
  now generate fixture passwords in-test), so future scans stay
  clean. No credential rotation is required; no production-side
  action was taken or is needed. (The credential value itself is
  deliberately not reproduced here.)

## 1. Placement (ARCH-01 ownership)

New migration `2026_10_16_000001_create_core_setting_secrets_and_revisions`
lives in `app/Core/Settings/Database/Migrations/` (domain-owned
path, filename ordering keeps it after 000016). Services live in
`app/Core/Settings/Services/` (`ScopedSecretService`,
`SettingRevisionRecorder`). Existing conventions win over the
suggested `Policies/`/`Tests/` folders: Core authorization is
service-level (`MembershipPermissions`, C1–C7-2), and tests live
in `backend/tests/Feature/Core` — no competing infrastructure
was introduced.

## 2. Secrets storage & encryption contracts

- Dedicated `core_setting_secrets` (definition FK RESTRICT,
  polymorphic owner, unique owner+key, monotonic `version`,
  actor metadata, `key_version`). Generic `core_setting_values`
  continues to hard-reject secrets (test-proven), and secret keys
  never enter revisions (a `LogicException` guard in the recorder
  is the second line of defense).
- Ciphertext = Laravel `Crypt::encryptString` (authenticated
  encryption, application key from environment). The key is never
  stored in the database and never generated per request; invalid
  key configuration fails closed (`setting_secret_encryption_unavailable`
  on write, `setting_secret_undecryptable` on consume — neither
  message carries payload or key material). `key_version` ('v1')
  is recorded per row so a future rotation can re-encrypt
  deliberately; operators must back up `APP_KEY` with the same
  rigor as the database (documented here; rotation itself is a
  future ops stage, out of scope).
- Administrative reads expose ONLY `{configured, version,
  updated_at}`. The `ciphertext` attribute is `$hidden`; tests
  assert plaintext appears in no stored row, audit summary,
  model JSON, exception, or history.
- Internal consumption (`consumeForOrganization` /
  `consumeForWorkspace`) is the ONLY plaintext path: server-side
  execution contract, re-checking Organization lifecycle and, for
  Workspace secrets, that the owning module is currently ENABLED
  (a ciphertext row alone never makes a secret usable). It is not
  HTTP-reachable and never returns via DTOs.

## 3. Scoped permission provisioning

New catalog keys `organization.settings.secrets.manage` and
`workspace.settings.secrets.manage`, listed in
`PermissionCatalog::SEPARATELY_PROVISIONED_KEYS` and EXCLUDED
from `managerKeysForScope()` — protected Manager provisioning
no longer auto-grants them by catalog sync (the two CoreRbacTest
expectations were updated to this explicit new contract, the
same reviewed-amendment pattern as C6-2). They are granted only
by an explicit, separate provisioning act (dedicated role +
assignment). Organization ≠ Workspace authority, Platform/Legacy
Admin confers nothing — all denial paths test-proven. Full
authorization precedes any encryption work; disabled-module and
suspended/ended denials preserve rows; expected-version
conflicts (`setting_version_conflict`), transaction/lock order
(container row → secret row), and value-free audit in the same
transaction (audit failure rolls back — proven) follow C7-2
conventions exactly.

## 4. History & restore algorithms

- `core_setting_revisions` (append-only; `created_at` only):
  actor, scope owner, key, operation
  (create/update/remove/restore/policy), resulting version,
  previous/new state with `*_present` flags — absent vs explicit
  null is preserved exactly. Every C7-2 mutation (organization,
  workspace, user preference, and override-policy changes)
  records a revision inside the same transaction, linked to its
  audit row id. History reads (`revisionsFor`) require the
  scoped view permission and refuse secret keys
  (`setting_history_unavailable`).
- Restore (`restore{Organization,Workspace,UserPreference}Value`)
  reauthorizes against CURRENT membership/lifecycle/permissions,
  re-checks current gates (definition scope, module state,
  Workspace override policy), revalidates the historical value
  against the CURRENT registry definition, enforces the expected
  version against the CURRENT stored state, and commits as a NEW
  version with its own audit event + a `restore` revision — the
  chain is never rewritten. Restoring an absent state deletes
  the explicit override (no null substitute); restoring an
  explicit-null revision restores exactly null. Revisions from
  another scope/key are indistinguishable from missing
  (`setting_revision_not_found`).

## 5. Performance (SPEC-PERF-01)

No caching anywhere: correctness never depends on cache
availability, no cross-scope cache sharing exists, and secret
revocation is effective on the very next consumption because
consumption reads the row directly. No Redis dependency added.

## 6. Verification evidence

- SQLite suite: secrets lifecycle/permissions/isolation/module/
  lifecycle/audit-rollback + history create-update-remove,
  null-vs-absent, restore (incl. policy-changed and cross-scope
  denials), policy history — plus FULL C1–C7-2 + ARCH-01
  regression in the same CI run.
- MySQL (`SettingsSecretsConcurrencyMysqlTest`, permanently in
  the CI list): competing secret replaces serialize on the
  Organization row lock with monotonic versions and stale-version
  rejection after the race; a racing restore cannot overwrite a
  committed write (1205 block → `setting_version_conflict` →
  clean restore with appended history).
- Final CI SUCCESS at `ad9991d`: Pint, PHPUnit, MySQL migration
  gate + concurrency, frontend gates. TEMP diagnostics used in
  bring-up were removed; the workflow diff vs the ARCH-01
  baseline is exactly one line (the new MySQL test class).

## 7. C7-4 handoff

C7-4 can build HTTP APIs/React UI directly on:
`ScopedSettingService` (values + `revisionsFor` + restore trio),
`ScopedSecretService` (put/revoke/metadata; consumption stays
internal and must NOT be exposed as a reveal endpoint). API
design must keep metadata-only secret responses and reuse the
stable codes: `setting_forbidden`,
`setting_organization_unavailable`, `setting_version_conflict`,
`setting_override_denied`, `setting_module_disabled`,
`setting_module_unavailable`, `setting_history_unavailable`,
`setting_revision_not_found`, `setting_secret_encryption_unavailable`,
`setting_secret_undecryptable` (+ C7-1 validation codes).

PR #14 remains OPEN and UNMERGED; production is unchanged.
