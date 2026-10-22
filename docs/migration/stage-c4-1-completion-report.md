# Stage C4-1 completion report — code-defined module registry & dependency infrastructure

Branch `arena/582a70e5-main-tadbir` (PR #14, open, unmerged),
pending explicit human acceptance.

## Existing-structure finding

Stage 02 already provided an in-memory `ModuleRegistry` of
`ModuleManifest`s (id + owned permission keys) with no database
backing, and the Projects pilot declares its manifest without
registering it. C4-1 does not replace or duplicate that
contract: the persisted registry below is the activation/
entitlement-facing catalog (definitions, dependencies,
availability, workspace state), while Stage 02 manifests remain
the permission-ownership contract modules register when they
migrate. The two meet in C4-2/C5 wiring, not in parallel
inventories — both derive from the same module keys.

## Schema (migration `2026_10_15_000009`)

- `core_modules` — key (unique), display name, `availability`
  (`available|unavailable`, MySQL CHECK).
- `core_module_dependencies` — direct edges, composite UNIQUE
  (module, required), FKs cascade, MySQL CHECK against
  self-dependency.
- `workspace_modules` — per-workspace activation state
  (`enabled|disabled`), enable/disable timestamps and actor
  references, UNIQUE (workspace, module); module FK is RESTRICT
  so activation history cannot be cascade-destroyed.
- `organization_module_policies` — per-organization
  `allowed|denied` policy, UNIQUE (organization, module).

## Registry contract

`ModuleCatalog` is the canonical code source: the 22 modules of
catalog v1.3 (16 reusable + 6 specialized; features and
compositions correctly absent), sorted deterministically, with
`VERSION = 1` and a SHA-256 `fingerprint()` over the canonical
definition set. Availability is implementation reality only —
`projects` (04B pilot) is available; all other modules are
inventoried as unavailable and are never presented as
activatable. Dependencies are the catalog's declared
composition prerequisites (25 edges; e.g. surveys→forms,
procurement→crm+finance+workflows, events→8 prerequisites).

`ModuleRegistrySynchronizer` is fill-the-gaps idempotent: it
creates missing module rows/edges and aborts the whole sync on
any persisted disagreement (renamed module, availability drift,
unknown persisted module, unexpected edge). It never touches
workspace activation rows or organization policies, never
enables anything, and never grants RBAC permissions.

`ModuleDependencyResolver` validates eagerly (unknown
prerequisites, self-dependency, duplicate edges, cycles) and
offers direct prerequisites, transitive closure in topological
order, full deterministic topological ordering, and direct +
transitive reverse-dependency lookups for C4-2 deactivation
safety.

## Disabled-by-default & entitlement semantics

Absence of a `workspace_modules` row means disabled; nothing
creates rows at workspace creation (proven for personal and
organization workspaces). The C5 boundary is the narrow
`ModuleEntitlementGate` interface; the default binding is
`UnavailableModuleEntitlementGate`, which denies everything —
absent/unknown entitlement fails closed, and there is no
allow-all placeholder anywhere. Organization suspension/ended
restrictions (C3) are untouched and continue to override any
future activation state.

## Verification

- `ModuleRegistrySyncTest` (9 tests): deterministic catalog and
  fingerprint; idempotent sync (22 modules/25 edges, second run
  no-ops); disabled-by-default incl. at workspace creation;
  activation-record and membership preservation across sync;
  zero permission/role grants; conflict rejection (tampered
  definition, rogue module, unexpected edge); resolver closure,
  topological order, reverse lookups; cycle/self/missing/
  duplicate/unknown rejection; fail-closed entitlement with an
  injected double proving the seam.
- `ModuleSchemaMysqlTest` (real InnoDB): availability/status/
  policy CHECK enforcement, self-dependency CHECK, dependency
  FK rejection, composite uniqueness for edges and
  workspace/module pairs.
- Full regression green (C1, C2, C3 suites, Pint incl. the new
  Core\Modules files, frontend gates).

## Remaining C4-2 integration requirements

Activation preview/confirmation and atomic prerequisite
activation; deactivation using `allDependentsOf` plus active-
dependent refusal; operational access denial for disabled
modules (with organization policy from
`organization_module_policies` and the entitlement gate composed
in that order); reconciliation of the Projects pilot's
ModuleAvailabilityGate with workspace activation state;
workspace-manager authorization (`workspace.modules.manage`-class
permission is a C4-2 catalog decision). C4-3 adds HTTP APIs.
