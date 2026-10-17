# Stage C7-1 — Code-Defined Scoped Settings Registry, Persistence Schema & Validation Contracts — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `db569dd` (C6 + onboarding amendment). Implementation
head: `efbc72f` (CI SUCCESS on push + PR checks; this report
commit follows). Date: 2026-10-17.

Code Complete: YES / Security Verified (within tested boundaries): YES
/ Dev-CI Ready: YES / Production Operationally Ready: NO (no writers
with authorization, secrets, history, or UI yet — C7-2…C7-4).

## 1. Existing-state findings & compatibility approach

- Organization public display metadata lives in the legacy
  `organizations.settings` JSON column (`settings.public.description`
  / `settings.public.logo_url`), read exclusively by the C6
  `InvitationPresenter`. Workspaces have no settings column; the
  legacy `SystemSetting` table is application legacy, not Core.
- C7-1 does NOT migrate, rename, or overwrite any of that data, and
  the presenter is untouched. The registry records the canonical
  keys (`organization.public.description`, `organization.public.logo_url`)
  with their `legacy_source` paths, so C7-2 can migrate WRITES to the
  canonical store later. Until then there is exactly one writable
  source (the legacy JSON) — no dual-write was introduced, and a
  test proves the presenter output is byte-identical in behavior
  while `core_setting_values` stays empty for these keys.

## 2. Schema & constraints (migration 000015)

- `core_setting_definitions` — persisted registry mirror. Stable
  `key` UNIQUE; type/sensitivity/inheritance domains (MySQL CHECKs);
  JSON default/allowed-scopes/constraints; override/inheritance/
  mandatory/nullable flags; `owner` (`core` or a C4 module key);
  `version`; `fingerprint` char(64).
- `core_setting_values` — explicit non-secret overrides. UNIQUE
  `(owner_type, owner_id, setting_key)`; `setting_key` FK →
  definitions.key RESTRICT (definitions cannot vanish under stored
  values); `owner_id` is polymorphic (organization/workspace/user)
  and deliberately NOT a DB FK — no single target exists; owner
  existence is enforced by the store (stated plainly, not implied
  FK-safe). A row's existence is the override; `value_json` holds
  the deterministic JSON encoding, `'null'` being an explicit-null
  override (absent vs explicit null distinguishable); monotonic
  per-setting `version`; `updated_by_user_id` FK nullOnDelete.
- `core_setting_override_policies` — UNIQUE `(organization_id,
  setting_key)`; both FKs RESTRICT. A missing policy means "use the
  definition's declared default" — `workspace_override_default`
  defaults to false (default-DENY), never an accidental grant.
- History and secret tables are DEFERRED to C7-3 by design (see §5).

MySQL evidence (`SettingsSchemaMysqlTest`, permanently wired):
CHECK domains enforced, unique/FK violations raise QueryException,
definition-with-values delete RESTRICTed, organization-with-policy
delete RESTRICTed, transactional rollback leaves counts untouched.

## 3. Registry & validation contract

- `SettingDefinition` (immutable DTO): stable dotted key, title,
  description, type, default, allowed scopes, constraints,
  inheritance (`none` | `organization_to_workspace`), workspace/
  user override support, per-key workspace-override default,
  `mandatory` (higher-level ceiling marker), nullable, owner,
  sensitivity (`public` | `internal` | `secret`), version.
  `fingerprint()` = SHA-256 over every semantic field (key order
  normalized) — deterministic across processes (tested).
- Registration is strict (`SettingsRegistry`): structural validity
  (including the default validating against its own type; enums
  must declare values; JSON must declare an explicit schema;
  inheritance requires both scopes) and duplicate keys always
  rejected as conflicts — never overwritten. Ownership: `core` or
  a stable `ModuleCatalog` key; `registerForModule()` rejects
  unknown modules and owner mismatches ("settings registered by
  the wrong module" cannot happen).
- Seeded Core definitions are ONLY existing contracts: the two C6
  public-metadata keys (above) plus `user.experience.locale` /
  `user.experience.timezone` presentation preferences (decision:
  user preferences are presentation-only). No commercial catalog
  was invented; no module definitions are seeded (the module
  registration path is proven with test fixtures owned by
  `projects`).
- `SettingValueValidator`: strict deterministic types — string
  (trimmed, max length, optional URL format), boolean (no 1/0
  coercion), integer (no string coercion, min/max), enum, IANA
  timezone, locale (pattern + optional allowlist), JSON objects
  only against a declared scalar schema (unknown fields rejected,
  deterministic key order). No resource identifiers, permissions,
  class names, or secrets are representable as editable values.

## 4. Synchronization & persistence primitives

- `SettingsRegistrySynchronizer` (ModuleRegistrySynchronizer
  contract): fill-the-gaps creation; fingerprint-identical rows
  skipped (titles/descriptions refresh only); changes apply only
  on a declared version bump; same/lower-version mismatches and
  unknown persisted keys are `setting_registry_drift` and abort
  the transaction. Idempotent (tested). It touches ONLY the
  definitions table — no module activation, RBAC grants,
  subscriptions, memberships, or materialized defaults (asserted).
- `SettingValueStore` (internal primitive, explicitly NOT an HTTP
  surface): registered-keys-only (persisted mirror), scope
  enforcement, owner-existence enforcement, strict validation,
  hard secret refusal, in-place upsert with version increments
  under row lock, `forget`, policy write/read with default-deny
  fallback. It performs NO authorization and NO audit — that is
  C7-2's change service, and the class docblock says so.
- Registry bound as a container singleton in ModuleServiceProvider;
  synchronization is an explicit operator/test action (like module
  sync and plan provisioning), never a request-time side effect.

## 5. Secrets separation boundary

Secret-sensitivity definitions may be REGISTERED (metadata for
C7-3) but the generic store rejects them unconditionally
(`setting_secret_not_storable`, tested: nothing is persisted).
There is no code path by which a secret value can enter
`core_setting_values`, and since C7-1 ships no readers/APIs at all,
secrets cannot leak through reads, history (deferred), or audit
(none written). Secret storage/encryption/key management remains
C7-3, with the definition metadata (key, scope, sensitivity)
already in place for it.

## 6. C7-2 handoff requirements

C7-2 builds on these contracts (shipped as code, unimplemented on
purpose): `EffectiveSettingResolver` interface + `SettingLayer`
precedence (User preference → Workspace override → Organization
value → Platform default), where each layer is consulted ONLY as
the definition permits (scopes, user override, workspace override
+ Organization per-key policy, org→workspace inheritance),
`mandatory` acts as a ceiling lower layers cannot bypass, the
Organization derives from the persisted Workspace row, defaults
are computed (never materialized), and ambiguity fails closed.
C7-2 must add: the authorized change service (scoped
`*.settings.manage`-style permissions decided there, independent
per key/scope; Organization authorization never implies Workspace
access; Platform admins get no implicit Workspace settings
access), lifecycle enforcement (suspended/ended per C3), disabled
-module edit denial (stored values retained), transactional
audit, and the legacy `organizations.settings.public.*` write
migration onto the canonical keys (retiring the legacy writable
source without breaking the C6 presenter).

## 7. Scope discipline

No settings HTTP APIs, no React panels, no secret management, no
history/restore, no module/settings activation interplay, no
registration/tax fields. PR #14 remains OPEN and unmerged; `main`
untouched; no production changes.
