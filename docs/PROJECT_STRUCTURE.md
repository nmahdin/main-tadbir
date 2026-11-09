# TADBIR Comprehensive — Target Project Structure and Gradual Refactoring Strategy

- **Status:** PROPOSED in Stage 01; partially realized (Stages 02–04B: `app/Core/{Organizations,Workspaces,Memberships,Rbac,Authorization,Modules}`, `app/Modules/Projects`, `app/Integrations` placeholder). **Core v1 finalization in §6 (design-freeze stage) is PROPOSED pending approval.** Realized gradually per §5 and ADR-0001/0012; no directory is moved by the design stage.
- Principle (user requirement 10): structure follows module migration. **No single cosmetic reorganization PR.**
- Principle (conditional approval, 2026-10-15): **keep existing working functionality** — a structure change that breaks a working feature without an architectural reason is a defect, and unnecessary abstractions (extra layers/interfaces "for later") are prohibited; every seam must serve a current, named need (see `docs/CODING_STANDARDS.md` §1.7). Legacy structures are deleted only when their replacement and all dependent code paths are ready and tested (roadmap removal rule).

## 1. Target backend structure (Laravel modular monolith)

```text
backend/
  app/
    Core/                              # Platform Core (ADR-0001): no business-module imports
      Identity/                        # User, account status, Sanctum/session integration
      Organizations/                   # Organization, OrganizationMembership
      Workspaces/                      # Workspace, WorkspaceMembership, workspace resolution/context
      Access/                          # Central authorization decision (core.md §2.1), roles/permissions, grant ceiling
      Settings/                        # Scoped settings registry (platform/organization/workspace)
      Entitlements/                    # Module registry, plans, subscriptions, limit evaluator (Stage 06)
      Audit/                           # audit_logs writer/query (separate from activity feed)
      Notifications/                   # Inbox, preferences, delivery orchestration
      Files/                           # Storage + secure file-access contract (modules own asset meaning)
      Events/                          # Domain-event bus/outbox (conditional, ADR-0011)
      Support/                         # Genuinely cross-cutting helpers only
    Modules/
      Projects/                        # projects, tasks, templates, plans (each module analogously:)
        Domain/                        #   Models, enums, value objects, domain services/actions
        Application/                   #   Use-case services, contract implementations, DTOs
        Http/                          #   Controllers (thin), FormRequests, Resources, routes.php
        Events/  Listeners/            #   Published/consumed domain events
        Policies/                      #   Thin policy adapters over Core\Access decision
        Contracts/                     #   Public interfaces other modules may call (§ contracts)
        README.md                      #   Module contract sheet (CODING_STANDARDS §5)
        routes.php                     #   Registered by the module registrar, prefix /api/v1
      Content/  Dam/  OperationalRecords/  Chat/  Secretariat… (one folder per registered module)
    Integrations/
      Bale/                            # Adapter: webhook/panel/bot handlers → Contracts only
      GoogleWorkspace/                 # Adapter: Drive/Docs/Sheets/Calendar/Meet sync
    Http/  Providers/  Console/        # Thin framework shell: global middleware, providers, schedule registry
  Modules-or-Core tests mirror the same split under tests/{Unit,Feature}/<Area>/
```

**Folder responsibilities & import rules (enforceable, tested from Stage 02):**
- `Contracts/` + registered events are the *only* public surface of a module. Other modules import nothing else from it; `Domain/` internals are private.
- `Core/*` may be imported by all; `Core` imports nothing from `Modules`/`Integrations`; `Integrations` import only `Contracts`; modules never import `Integrations`.
- `Http/` never contains business rules; `Domain/` never references `Request`/HTTP; `Application/` orchestrates contracts + transactions.
- Legacy `app/Http/Controllers/Api/V1`, `app/Services`, `app/Models`, `app/Bot/Bale` remain valid *legacy zones* until their owning module migrates (Stage 05), then the old location is deleted in that PR. New code is never added to legacy zones for migrated domains.

## 2. Target frontend structure (feature-based; functional only — visual system untouched)

```text
frontend/src/
  app/                    # Bootstrap: main, router, providers, global error/chunk handling (from current App.tsx/routing/context)
  design-system/          # Primitives & tokens owned by the frontend/Design-System contributor (current components/common + index.css evolve here by them)
  shared/                 # Genuinely reusable non-domain code: api client core, query client, date/Jalali utils, hooks
  features/
    identity/  workspaces/  projects/  tasks/  content/  dam/  operational-records/
    chat/  secretariat/  notifications/  settings/  admin/
      components/         # Feature components (presentational + containers)
      api/                # Typed DTOs + endpoint functions for this feature only
      hooks/  pages/      # Feature hooks and route-level pages
      permissions.ts      # Re-export from the single catalog (no hand-copied keys)
      index.ts            # Public exports of the feature; everything else is internal
  routes/                 # Route table composing feature pages (current routing/ evolves here)
```

**Rules:** features import only `shared/`, `design-system/`, and other features' `index.ts` public exports; no cross-feature deep imports; no domain logic in `shared/`; server state via `shared` query layer only. Current `components/<domain>/`, `api/*.ts`, `queries/`, `context/`, `utils/` are the legacy zones that map 1:1 onto features as each is touched (mapping guidance, not a scheduled move).

## 3. Repository-level notes (CONFIRMED constraints)
- `backend/vendor/` and `frontend/dist/` are tracked release artifacts for shared hosting (documented policy). Target structure work must not untrack or relocate them; that is a separate deployment decision.
- Root `scripts/` holds read-only audit tooling (e.g. `audit-permissions.py`); generated inventories live in `docs/security/` and are refreshed, not hand-edited.

## 4. Naming & placement quick rules
New domain concept → its module's `Domain/`; new endpoint → that module's `Http/` + `routes.php`; new cross-module need → a `Contracts/` interface or an event, never a direct model import; new shared platform capability → `Core/` only if ≥2 modules need it now (avoid speculative framework-building, playbook Stage 08 caution); new React screen → its feature's `pages/` using design-system primitives.

## 5. Gradual refactoring strategy (no big-bang)
1. **Stage 02:** create empty `app/Core`, `app/Modules`, `app/Integrations` skeletons + registrar + architecture tests proving the boundaries; move *nothing* with behavior. Frontend: no moves; document feature mapping for `components/*`.
2. **Stage 03:** new Core domain (organizations/workspaces/memberships/RBAC) is born directly in `app/Core/*`; legacy identity columns/classes stay fully intact and authoritative for unmigrated code until the Stage 04 cutover PR deletes them — and that PR may only run when the replacement and every dependent code path are ready and tested.
3. **Stage 04:** authorization decision born in `Core/Access`; one module (Projects) migrates fully into `app/Modules/Projects` as the reference implementation.
4. **Stage 05:** each module PR = move that module's classes into its folder + replace cross-module calls with contracts + delete the vacated legacy classes in the same/next PR. A legacy class may be `use`d by unmigrated code only via a module Contract (adapter class inside the owning module, with a removal criterion — a code-level seam, not a data compatibility layer).
5. **Frontend (per feature touch, by/with the frontend contributor):** when a feature's API contract changes, its UI code is regrouped into `features/<name>/` in that same functional PR — routes/components keep their visuals; no standalone "move files" PRs.
6. **Stage 08:** delete empty legacy zones (`app/Services` remnants, `app/Bot`, duplicated frontend folders), archive stale docs/inventories, and assert with architecture tests that legacy zones are gone or explicitly retained with reasons.

Each step is independently testable and reversible by reverting that PR; at no point does the tree contain two implementations of the same business rule for the same module.

## 6. Core v1 finalized structure (design-freeze proposal)

Refines §1–§2 for Core v1 completion. Changes vs §1 draft: `Core/Access` is realized as `Core/Rbac` + `Core/Authorization` (as built — keep, do not rename); settings/entitlements/notifications/files/audit get concrete homes below; module internals stay flatter than the §1 sketch until a module's size justifies subfolders (400-line cohesion review rule).

```text
backend/app/
  Core/
    Identity/            # (new) account lifecycle service over users; auth boundary helpers
    Organizations/       # as built
    Workspaces/          # as built (+ file_epoch column later)
    Memberships/         # as built (lifecycle/status)
    Invitations/         # (new, ADR-0015) invitation service + acceptance
    Departments/         # (new, D-22) workspace departments + membership
    Rbac/                # as built (catalog, roles, ceilings, final-manager guard)
    Authorization/       # as built (decision, context, scope, gate contracts)
    Platform/            # (new, ADR-0014) platform role assignments + admin services
    Billing/             # (new, ADR-0013) plans, plan versions, subscriptions, evaluator
    Entitlements/        # (new) effective-entitlement + quota evaluator used by gates
    Settings/            # (new) scoped settings registry + resolution
    Modules/             # as built (manifest/registry) + activation services
    Files/               # (new, ADR-0016) storage mediation, signed links, quotas
    Notifications/       # (new, ADR-0016) inbox, preferences, deliveries
    Audit/               # (new) audit_logs writer (transactional) + query
    Events/              # (new) outbox + tick draining (ADR-0011)
    Support/             # genuinely cross-cutting only
  Modules/<Module>/      # per §1, plus Pilot/ retired at C5; Contracts/ is the only public surface
  Integrations/          # Bale/, GoogleWorkspace/ adapters → Contracts only
  Http/ Providers/ Console/   # thin shell, as built
backend/config/          # projects.php pilot config is temporary (retired at C5); billing/settings registries land with their stages
```

Frontend finalization (functional organization only — visual system untouched, owned by the frontend contributor): `frontend/src` keeps its current layout (`api/ auth/ components/ context/ queries/ routing/ utils/`) as legacy zones; the §2 feature layout is adopted **per feature touch** when that feature's API contract changes (workspace admin, role management, subscription admin are new features born directly under `features/`). Shared API contract types live with the feature that owns them; permission-key parity between the legacy catalog and its TS mirror remains test-enforced until modules migrate to scoped keys, at which point the scoped catalog is generated/mirrored the same way. No standalone frontend reorganization PR.
