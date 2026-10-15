# Core Design Review Report — Design Freeze Stage (baseline `7b90a73`)

Purpose: state plainly what is approved, what this design stage recommends, what contradicts or is risky, and what **requires human approval** before implementation. A green documentation check is not approval: nothing below is implemented by this stage.

## 1. Approved existing architecture (CONFIRMED, not reopened)
Modular monolith + module ownership (ADR-0001); XOR workspace ownership and default invariants (0002); independent org/workspace memberships, org admin ≠ workspace access (0003); scoped RBAC with protected defaults, grant ceilings, one role per membership (0004); workspace-records rename direction (0005); flat workspace departments direction (0006); dev-reset strategy with per-database authorization (0007); workspace isolation + one central authorization decision (0008); dual-engine constraint strategy (0009); four-gate entitlement separation, manual activation, new features default-disabled (0010); shared-hosting background model (0011); coding standards/project structure gates (0012). Implemented and verified: Stages 03A/03B foundations, 04A engine, 04B Projects pilot incl. gates-via-pilot-policy and analytics firewall (baseline `7b90a73`).

## 2. Contradictions and inconsistencies found (with disposition)
| # | Contradiction | Disposition in this design |
|---|---|---|
| 1 | `core.md` header still says "Nothing in this document is implemented yet" (Stage 01 text) while Stages 03–04B implemented much of it | Keep `core.md` as the Stage 01 record; `core-v1-specification.md` becomes authoritative on approval; add pointer note to `core.md` (docs-only, this stage) |
| 2 | Roadmap Stage 03 promised workspace-scoped departments in the Core schema; 03A/03B shipped without them (legacy departments still global) | Explicitly scheduled as roadmap C6 with a concrete model (D-22); capability matrix marks MISSING, not silently assumed done |
| 3 | ADR-0010 playbook-derived over-limit rule "workspace over-limit → org operations blocked until admins deactivate workspaces" vs spec §E "freeze the over-limit dimension only" | **Flagged for approval (OD-2c):** recommendation is dimension-scoped freeze (safer, data-preserving); the playbook wording should be amended on approval |
| 4 | `AuthorizationService` documentation (§2.1) says consumers must resolve via container for future gate bindings, but 04B's `ProjectAuthorizer` deliberately constructs a dedicated instance with pilot gates | Documented as intentional and temporary; C5 restores container resolution and deletes the pilot instance — architecture doc already describes this; no action now |
| 5 | `PermissionCatalog` docblock says module keys are "registered here" by hand, while Stage 02/K design wants manifest-driven registration | C7 converts to manifest-driven registration; keys/scopes unchanged; until then the hand-edited catalog is the single source (no duplicate created) |
| 6 | Organization suspension exists as a status string but the authorization decision ignores organization status (only workspace status) | Decision Spec adds step 2 (`organization_inactive`); C3 implements + tests |
| 7 | Two "workspace" concepts still collide in legacy code (`WorkspaceRecord` operational records vs Core workspaces) | ADR-0005 rename at module migration; design does not rename anything now |
| 8 | SQLite XOR/scope CHECKs absent (model-only) vs MySQL enforced — parity gap carried since 03A | Data model §4 item 1; OD-5 decision (rebuild at freeze vs accept engine asymmetry) |
| 9 | Frontend still uses the legacy 78-key permission catalog + parity mirror while scoped keys exist backend-side | Kept intentionally until module migrations; structure doc §6 defines per-feature adoption; no frontend change authorized in Core stages except API-contract coordination |

## 2b. Product-alignment additions (this stage)
ADR-0017/0018 and the catalog/contracts documents extend the freeze to the three product families without changing any Core contract: reusable modules stay single-sourced, solutions compose, templates are data-only, public participants stay outside membership. No prior recommendation is contradicted; OD-8…OD-10 are the new approval items. The C1–C9 roadmap is unchanged in order — product/module stages remain strictly after Core completion.

## 3. Risks
- **R-1 Pilot-gate complacency:** `PROJECTS_WORKSPACE_PILOT` could be enabled accidentally outside development before C5. Mitigation already in code: production hard-stop; C5 deletes it. Recommendation: platform owners should not set the flag on any shared environment.
- **R-2 Entitlement scope creep:** quotas/feature maps can balloon into a rules engine. The design caps v1 at numeric limits + module/feature enablement; anything richer is post-v1.
- **R-3 Invitation identity proof** is the largest security-sensitive unknown (email/phone verification strength, account takeover via invite to a recycled address). OD-3 must choose verification strength before C4.
- **R-4 Production-data ambiguity:** all cutovers assume disposable dev data (user-confirmed). If any database is later declared non-disposable, ADR-0007 fallback machinery becomes a hard prerequisite — currently unbuilt and unestimated.
- **R-5 Unknown host facts (Q-02/Q-03/Q-04):** MySQL version, scheduler, backups remain UNKNOWN; the design avoids depending on them (tick model), but Stage-08 readiness cannot close without evidence.
- **R-6 Audit volume/privacy:** transactional audit on management mutations is safe; operational decision logging is deliberately sampled (spec §I) — retention/masking numbers need OD-4.

## 4. Decisions requiring human approval (OD) — implementation blockers
| ID | Decision | Recommended default | Alternatives / trade-offs | Blocks |
|---|---|---|---|---|
| OD-1 | Platform-admin scope & powers (Q-10) | ADR-0014 minimal management-plane keys, no workspace data access, no impersonation | Broader support access (faster support, higher risk, needs consent+audit design); or no platform plane (ops via DB — unacceptable for SaaS) | C2 |
| OD-2 | Subscription business policy (Q-01): (a) grace 7d / expiry horizon 30d, (b) free plan existence, (c) downgrade timing & over-limit semantics, (d) refund/void | (a) 7d/30d, (b) yes — platform-defined free plan, (c) downgrade at period end + dimension-scoped freeze (amends ADR-0010 wording), (d) out of v1 | Shorter grace (revenue pressure vs user trust); no free plan (bootstrap needs a code exception — rejected); immediate downgrade (proration complexity) | C5 |
| OD-3 | Invitation verification strength | Email signed link; phone OTP; username invite requires signed-in match; 7-day expiry | Link-only for all channels (weaker for phone); mandatory account pre-registration (worse UX, stronger identity) | C4 |
| OD-4 | Numbers: signed-link TTL (15m), file soft-delete retention (30d), audit retention (≥1y) | As stated | Longer TTL (convenience vs exposure); shorter audit retention (storage vs forensics) | C8/C9 |
| OD-5 | SQLite CHECK parity | Accept MySQL-enforced + SQLite model-enforced until a disposable-dev fresh-schema rebuild is explicitly authorized | Authorize rebuild stage (cleanest parity; costs a dev reset authorization) | C1/C6 schema work |
| OD-6 | Org role templates in v1? (Q-06) | Defer post-v1 (explicit preview/apply design recorded) | Include in v1 (adds propagation/concurrency scope to C-stages) | None (post-v1) |
| OD-7 | Legacy-settings inventory ownership (Q-11) | Every legacy key classified platform/org/workspace at C7; unclassified stays platform | Bulk-move to org scope (risk: silently widening admin reach) | C7 |
| OD-8 | Product layering & catalog as the canonical inventory (ADR-0017) | Approve four-layer model + catalog IDs as entitlement/manifest identifiers | Family-specific forks of shared modules (rejected: duplication); solutions owning shared engines (rejected for forms/finance) | Post-Core module stages |
| OD-9 | Public participant identity model (ADR-0018) | Engagement-scoped module-owned participants with capability tokens; explicit promotion to membership | Treating participants as workspace guests (breaks the membership boundary); email-match auto-linking (account-takeover risk) | First portal feature (Events/Forms stages) |
| OD-10 | Personal dashboard aggregation breadth | Authorized summaries + deep links only; no field-level confidential data at widget level; per-source permission inheritance | Richer widgets (more leakage surface); opt-in per workspace (more consent UX) | Reporting/dashboard stage |
| OD-11 | Archived-workspace retention & hard-deletion policy | Archived = read-only preservation (Decision Spec §5b); hard delete platform-only after an owner-set retention period with notification; not built in v1 stages | Owner-initiated hard delete; indefinite retention | C3 (deletion half) |

## 4b. Correction-pass record (conditional-acceptance fixes)
1. **Catalog reconciled to v1.3** (24 current/planned + 14 deferred areas) with a full traceability matrix; reusable-module count corrected to **16** (+6 specialized); Reporting and Media Operations reclassified as compositions; Planning as a feature of `tasks`; Personal Finance as a profile of `finance`; Ideas & Innovation as the `operational-records` front-end.
2. **Roadmap dependencies repaired:** minimal audit foundation moved to C1 (C2/C4 no longer depend on C9); old C7 split — registration/activation is now C5a *before* subscriptions/gates in C5b, settings is independent C6; departments split into additive C7a and a hard-gated legacy cutover C7b; pilot gates stay fail-closed until C5b deletes them.
3. **Archived-workspace contradiction resolved:** one rule everywhere — archived = read-only preservation (Decision Spec §5b matrix); deletion policy explicitly undecided (OD-11), not silently accepted.
4. **Invitations hardened** (spec §C, ADR-0015): dual-scope ceilings with snapshots, org onboarding policy with approval mode, implicit org membership = minimal Member role only, in-lock quota/concurrency semantics, mandatory negative-test list.
5. **Solution templates bounded** (contracts §8): apply-time ceiling recomputation, no protected-role or entitlement bypass, audited atomic application.
6. **Cross-module use cases verified** (contracts §7): event tasks in projects (single project ownership + event references), event expenses in org Finance via aggregates, event content in Media Operations without copies, shared Forms engine, multi-solution workspaces, personal aggregation, workspace separation — each with link cardinality and link owner.

## 5. What "design freeze" means on approval
Approving this package (spec + data model + decision spec + ADR-0013…0016 + OD defaults) freezes Core v1 contracts: decision order, table responsibilities, gate semantics, and module contract rules. Implementation then proceeds C1→C9 with per-stage approvals; deviations require an ADR amendment, not silent code choices. Without approval of OD-2/OD-3/OD-1 respectively, C5/C4/C2 must not start — the rest of the roadmap is unaffected.
