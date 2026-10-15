# Product-Owner Approval Sheet — Core v1 Design (one page)

- **Status:** All items **PROPOSED/OPEN**. Nothing below is approved by the design documents themselves; implementation of a blocked stage may start only after its item is decided here (or explicitly waived with the default). Baseline: code `7b90a73`, design `de60c8f` + correction passes.

| ID | Decision | Recommended default (design's proposal) | Alternatives | Blocks |
|---|---|---|---|---|
| OD-1 | Platform-admin powers | Minimal management plane: view/suspend orgs & users (with reason), manage plans/modules/settings, read audit. No workspace data, no impersonation | Wider support access (needs consent+audit design); none (DB ops — not viable) | C2 |
| OD-2 | Subscription policy: (a) grace/expiry, (b) free plan, (c) downgrade timing & over-limit, (d) refunds | (a) 7-day grace, expired after 30 more days; (b) yes, platform-defined free plan; (c) downgrade at period end, freeze only the over-limit dimension; (d) out of v1 | Shorter grace; no free plan (needs a code exception — not recommended); immediate downgrade (proration complexity) | C5 |
| OD-3 | Invitation identity verification | Email signed link, phone OTP, username requires signed-in match; 7-day expiry | Link-only everywhere (weaker); pre-registration required (stronger, worse UX) | C6 |
| OD-4 | Retention numbers | Signed links 15 min; file soft-delete purge 30 days; audit retention ≥ 1 year | Longer TTL / shorter retention trade-offs | C9, C10 |
| OD-5 | SQLite CHECK parity | MySQL enforces; SQLite model-enforced until an explicitly authorized dev fresh-schema rebuild | Authorize the rebuild stage now | C1/C8 schema |
| OD-6 | Org role templates in v1 | Defer post-v1 (explicit preview→confirm design recorded) | Include (adds propagation/concurrency scope) | — |
| OD-7 | Legacy settings classification | Per-key classification at C7; unclassified stays platform | Bulk move to org scope (privilege-widening risk) | C7 |
| OD-8 | Product catalog v1.3 + four-layer model | Approve catalog IDs/dispositions (16 reusable, 6 specialized modules) as manifest/entitlement identifiers | Family forks of shared modules (duplication — not recommended) | Product stages |
| OD-9 | Public participant security policy | Engagement-scoped participants, capability tokens, no workspace access, explicit promotion to member | Workspace guest accounts (breaks membership boundary) | First portal feature |
| OD-10 | Personal dashboard breadth | Authorized summaries + deep links; source-permission inheritance; no confidential fields in widgets | Richer widgets (leakage surface); per-workspace opt-in | Reporting stage |
| OD-11 | Archived-workspace deletion policy (new) | Archived = read-only preservation; hard delete only by platform action after a retention period (period TBD by owner) with owner notification; no hard delete in v1 stages | Owner-initiated hard delete; indefinite retention only | C3 (deletion half only) |
| OD-12 | Cross-workspace finance summary (new) | **Deferred**: no org-level finance aggregation in v1; finance is per-workspace, org membership alone grants no financial visibility | Permission-checked org finance summary under a dedicated org finance permission (needs its own design) | Finance/Reporting design stage |

**Approving the design** = approving `core-v1-specification.md`, `core-data-model.md`, `authorization-entitlement-decision.md`, the catalog, contracts, ADR-0013…0018, and the OD defaults you select above. Stage-by-stage implementation approvals (C1…C9) remain separate.
