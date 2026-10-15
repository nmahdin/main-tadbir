# Core Capability Matrix — at baseline `7b90a73`

Legend: **VERIFIED** = implemented with passing automated tests in CI · **PARTIAL** = implemented subset, named gaps · **DESIGNED** = ADR/spec exists, no code · **MISSING** = not designed in code or only legacy equivalent · **DEFERRED** = intentionally beyond Core v1. "Legacy" rows describe the pre-Core implementation that still serves unmigrated modules.

## A. Identity and accounts
| Capability | Status | Evidence / gap |
|---|---|---|
| Single platform user identity, Sanctum auth | VERIFIED | `users`, existing auth suites |
| Username (email-less) accounts | VERIFIED | `docs/username-accounts.md` |
| Account status enforcement (active re-check per decision) | PARTIAL | Legacy enum `active/inactive/blocked/pending`; resolver re-reads user (04A). v1 `active/suspended/deactivated` normalization not done |
| Personal default workspace (lazy, unique) | VERIFIED | `PersonalWorkspaceProvisioner`, discriminator unique index (03A) |
| Account deactivation preserving history | PARTIAL | Membership end preserves rows; user-level deactivation flow/API not built for Core |
| Platform administration | MISSING | No platform scope/roles (Q-10 → OD-1 proposal in spec §D) |

## B. Organizations and workspaces
| Capability | Status | Evidence / gap |
|---|---|---|
| Atomic org creation (+ default ws, explicit memberships/roles) | VERIFIED | `OrganizationProvisioner` (03A/03B) |
| XOR ownership, one-default invariants (DB) | PARTIAL | MySQL CHECK + discriminators VERIFIED; **SQLite XOR model-enforced only** (fresh-schema rebuild not authorized/executed) |
| Org/workspace suspension in authorization | PARTIAL | Workspace suspension denies (04A resolver); organization status not in decision order yet (spec Step 2) |
| Archival lifecycle, deletion rules | DESIGNED | Spec §B; no status transitions/APIs beyond create |
| Workspace creation quotas | MISSING | Requires entitlement evaluator (§E) |
| Membership end ⇒ org-workspace denial | VERIFIED | Decision order step (04A tests) |

## C. Members, invitations, departments
| Capability | Status | Evidence / gap |
|---|---|---|
| Membership lifecycle active/deactivated/ended, rejoin=new row | VERIFIED | `MembershipLifecycle`, live-uniqueness (03A) |
| Current (non-ended) membership selection, no historical role leakage | VERIFIED | 04A correction `499fcf5` + regression tests |
| Final-manager invariant under concurrency | VERIFIED (MySQL) | Scope-row-first locking; dedicated two-connection tests. SQLite: sequential semantics only |
| Direct member add by managers | VERIFIED | Core membership endpoints (03A/03B slices) |
| Invitations (email/phone, expiry, accept) | MISSING | Q-08 → spec §C proposal (OD-3) |
| Org membership acquisition via workspace invitation | MISSING | Spec §C (only implicit path) |
| Manager self-join (explicit, audited) | MISSING | Spec §C |
| Workspace-scoped flat departments | MISSING (legacy global departments + hierarchy + teams in use) | ADR-0006 target; cutover stage C6; Q-07 → keep `is_primary` flag |

## D. RBAC and central authorization
| Capability | Status | Evidence / gap |
|---|---|---|
| Scoped catalog, protected defaults, custom roles, grant ceiling | VERIFIED | Stage 03B incl. concurrency hardening |
| Exactly one role per active membership; unknown keys 422 | VERIFIED | 03B |
| Central decision (order, failure taxonomy 403/404/503/422) | VERIFIED | Stage 04A (20 tests) |
| Query scoping / record ownership contracts | VERIFIED | `WorkspaceScope`, `ScopesToWorkspace` (04A) |
| First consumer migrated (Projects) + dual-mode firewall | VERIFIED | Stage 04B incl. analytics firewall hardening |
| Gates engaged for Projects via pilot policy (non-prod opt-in only) | PARTIAL (temporary) | `PilotGatePolicy`; **must be retired** when real gates land (roadmap C5) |
| Platform-scope roles | MISSING | OD-1 |
| Org role templates + controlled propagation | DESIGNED (post-v1 optional) | Q-06 → spec §D |
| Authorization audit events | MISSING | Spec §I (D-18 accepted, unimplemented) |
| Console/queue/Bale/Google on central decision | DESIGNED | Engine is transport-agnostic; adapters not migrated (Stage 05/module stages) |
| Module-manifest-driven permission registration | PARTIAL | Catalog is hand-edited constants today; manifests exist (registry stage C7) |

## E. Plans, subscriptions, entitlements
| Capability | Status | Evidence / gap |
|---|---|---|
| Four-gate separation (entitlement/policy/activation/permission) | VERIFIED as contracts | Gate interfaces + fail-closed defaults (04A) |
| Plans / plan versions / pricing periods | MISSING | Spec §E (OD-2 business choices) |
| Subscription lifecycle & renewal (manual v1) | MISSING | Q-01 resolved as PROPOSAL in spec §E + Decision Spec §5 (approval required) |
| Personal vs organization subscription coverage | MISSING | Spec §E |
| Module entitlements, feature limits, quotas | MISSING | Evaluator stage C5; Projects pilot gates are the temporary stand-in |
| Upgrade/downgrade preview & over-limit freeze | MISSING | Spec §E/Decision Spec §6 |
| Payments separation (`payment_attempts`) | DESIGNED | No provider in v1; manual activation path in spec |

## F. Settings and module activation
| Capability | Status | Evidence / gap |
|---|---|---|
| Scoped settings (platform/org/workspace/user) | MISSING (legacy global `system_settings` only) | Spec §F; Q-11 inventory needed per key |
| Module registry & manifests | PARTIAL | `ModuleRegistry` exists; only Projects manifest (unregistered); no activation state |
| Workspace activation within org-policy + plan ceilings | MISSING | Spec §F precedence chain |

## G. Shared file infrastructure
| Capability | Status | Evidence / gap |
|---|---|---|
| DAM file storage (module-owned) | VERIFIED (legacy module) | `dam_*` tables; not Core |
| Core Files service (ownership, quotas, mediated download) | MISSING | Spec §G |
| Signed links with revocation | MISSING | Q-09 → spec §G proposal (TTL + revocation epoch) |

## H. Notifications
| Capability | Status | Evidence / gap |
|---|---|---|
| Legacy inbox/Bale notifications | PARTIAL (legacy) | `NotificationInbox`, Bale classes |
| Core inbox, preferences, delivery retries | MISSING | Spec §H |

## I. Audit and activity
| Capability | Status | Evidence / gap |
|---|---|---|
| User-facing activity feed | VERIFIED (legacy) | `activity_logs` |
| Immutable security audit log | MISSING | Spec §I; transactional audit writes required |
| Log masking rules | DESIGNED | Spec §I item 3 |

## J. Events and background processing
| Capability | Status | Evidence / gap |
|---|---|---|
| Sync execution + Bale tick/outbox precedent | VERIFIED (legacy pattern) | ADR-0011 |
| Core domain events / transactional outbox | MISSING | Spec §J (outbox only for failure-critical events) |
| Host scheduler evidence (Cron/workers) | UNKNOWN | Q-03 — blocks any worker assumption, not the tick design |

## K. Module lifecycle
| Capability | Status | Evidence / gap |
|---|---|---|
| Manifest contract + architecture boundary tests | VERIFIED | Stage 02 (DependencyRulesTest etc.) |
| Registration/activation/dependency enforcement | PARTIAL | Registry stores manifests; dependency checks & activation unimplemented (C7) |
| Contract versioning rules | DESIGNED | Spec §K |

## L. Product architecture (product-alignment addendum)
| Capability | Status | Evidence / gap |
|---|---|---|
| Product/module/solution catalog (canonical IDs) | DESIGNED | `product-and-module-catalog.md` (this stage) |
| Solution templates & dashboard compositions | MISSING | Data-only bundles specified; need activation slice (C7) |
| Cross-module reference contract | PARTIAL | Same-workspace FK validation + contract reads proven narrowly in 04B (content plans/series); general contract DESIGNED (`cross-module-contracts.md`) |
| Dashboard/personal composition aggregation | MISSING (legacy aggregates firewalled in 04B) | Contract DESIGNED; implementation post-Core (reporting) |
| Public participants (portals) | MISSING | ADR-0018 proposal; OD-9 approval required |
| Scoped service identities for integrations | PARTIAL (legacy Bale/Google links) | Contract DESIGNED; token/grant model post-Core |

## Temporary / compatibility mechanisms (must retire)
| Mechanism | Retire when |
|---|---|
| Projects dual-mode (workspace-owned vs legacy records) + legacy firewall branches | Projects/Tasks module stages complete workspace ownership backfill-by-recreation |
| `PilotGatePolicy` + `PROJECTS_WORKSPACE_PILOT` | Real gates (C5) registered; pilot deleted in same stage |
| Legacy identity columns (`users.role_id/role_key/department_id`, `department_user.role`) | Identity cutover after all consumers migrated (D-09) |
| Legacy global `departments`/`teams*` + consolidation gate | Departments cutover (C6) |
| Legacy permission catalog (78 keys) + frontend parity mirror | Per-module as consumers migrate to scoped keys |
| Unregistered `ProjectsModule` manifest | Module lifecycle stage (C7) |
