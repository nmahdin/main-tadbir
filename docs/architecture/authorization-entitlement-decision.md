# Authorization & Entitlement Decision Specification (Core v1, design freeze candidate)

- **Status:** PROPOSED (design-only stage, baseline `7b90a73`). Steps 1–6 describe CONFIRMED behavior of `AuthorizationService` (Stage 04A) as consumed by Projects (04B); steps 7–10 and §5–§6 are the PROPOSED completion. On approval this document is authoritative for the decision order; `central-authorization.md` remains the as-built record of the 04A engine.

## 1. Inputs and trust rules
- Actor = authenticated platform user, re-read fresh from the database per decision (mid-session suspension honored). No cached contexts — every operation re-resolves.
- Workspace identifier from the client (route, header, input, job payload, bot session) is a **lookup key only**, never evidence. The context is derived server-side from the identifier + actor; record-scoped operations derive/verify the workspace from the record.
- Platform administrators receive **no implicit workspace context** (they fail membership steps like any non-member; their powers are management-plane only, spec §D/OD-1).

## 2. The decision (in order, deny-by-default; first failure decides)

| # | Check | CONFIRMED/PROPOSED | Failure |
|---|---|---|---|
| 1 | Platform account active (`active`; suspended/deactivated deny) | CONFIRMED (as `account_inactive`) | 403 `account_inactive` |
| 2 | Organization state (org workspaces only): organization exists; `suspended` denies all operational access; `archived` organization forces read-only for all its workspaces (same rule as §5b, applied at the org level) | PROPOSED addition | 403 `organization_inactive` (new reason code) |
| 3 | Workspace resolvable and not `suspended` (suspended denies everything operational). `archived` does **not** deny here: it switches the workspace to read-only — steps 6–10 still run, but only read/export operation classes may pass (see §5b) | CONFIRMED for suspended (`workspace_inactive`; unresolvable → invalid context); archived semantics PROPOSED (correction pass) | 404 invalid-context / 403 `workspace_inactive` / 403 `operation_restricted` for writes in archived workspaces |
| 4 | Organization membership: current (non-ended) and `active` — org workspaces only. Ended-only history → `organization_membership_inactive`; never existed → `organization_membership_missing` | CONFIRMED (incl. 04A rejoin correction) | 403 |
| 5 | Workspace membership: current and `active` (same missing/inactive distinction) | CONFIRMED | 403 |
| 6 | Scoped role permission: the membership's single role holds the operation's catalog key for the matching scope; unknown/cross-scope key = caller bug | CONFIRMED | 403 `permission_missing` / 422 unknown key |
| 7 | Module availability: module registered ∧ platform kill-switch on ∧ workspace activation enabled ∧ organization module policy ceiling allows | PROPOSED (contracts CONFIRMED; implementations future) | 403 `gate_denied` (explicit off) / `gate_unimplemented` (no implementation — fail closed) |
| 8 | Organization policy: mandatory org-level policies (e.g. module ceiling, sensitive-setting locks) permit the operation | PROPOSED | 403 `gate_denied` |
| 9 | Subscription entitlement: an *effective* subscription covers this workspace's owner (personal→user, organization→org) and its plan version entitles the module/feature (absent key = disabled) | PROPOSED | 403 `entitlement_missing` / per §5 status behavior |
| 10 | Feature limits & operation restrictions: quotas (members/workspaces/storage/feature-specific) and per-status operation class (read/write/manage/export) permit this operation | PROPOSED | 403 `quota_exceeded` / `operation_restricted` |

Record rule (applies at every step after 5): the target record's `workspace_id` must equal the resolved workspace; foreign and nonexistent are indistinguishable (404). Nested records must belong to the asserted parent. All list/search/export/aggregation queries are constrained server-side by the context (04B firewall pattern for legacy surfaces until they migrate).

## 3. Precedence summary
Platform module kill-switch > organization policy ceiling > subscription entitlement > workspace activation > role permission. All applicable layers must allow; no layer can grant what a higher layer denies, and a role permission can never override policy, entitlement, or quota. Organization management authority (steps 4/6 on the org plane) never satisfies operational steps 5–10.

## 4. Error categories (stable contract for all surfaces)
- **403 denied** with stable reason code (`account_inactive`, `organization_inactive`, `workspace_inactive`, `*_membership_missing/inactive`, `permission_missing`, `gate_denied`, `gate_unimplemented`, `entitlement_missing`, `quota_exceeded`, `operation_restricted`) — authenticated but not allowed.
- **404 invalid context** — malformed/nonexistent workspace, or record foreign to the resolved context (IDOR-safe).
- **422 contract error** — unknown/cross-scope permission keys, cross-workspace association attempts (module-level validation).
- **503 retryable** — transient concurrency (MySQL 1205/1213, SQLSTATE 40001, SQLite busy); never converted into a grant.
HTTP renders these; console/jobs/bots map them to "skip + audit + surface on next tick", never to silent success.

## 5. Subscription-status behavior matrix (PROPOSED — resolves Q-01 pending OD-2 approval)

| Subscription status | Read | Write (create/update) | Manage (members/roles/settings/billing) | Export |
|---|---|---|---|---|
| `active` | ✔ | ✔ | ✔ | ✔ |
| `past_due` (grace, PROPOSED 7 days from period_end) | ✔ | ✔ | ✔ (billing actions encouraged) | ✔ |
| `suspended` (past grace, unpaid) | ✔ | ✘ (`operation_restricted`) | Billing/platform only | ✔ (data egress preserved) |
| `expired` (suspended > PROPOSED 30 days) | ✔ read-only | ✘ | Billing/platform only | ✔ |
| `cancelled` (until period_end) | as `active` until period end, then → `expired` path | same | same | ✔ |
| none / never subscribed | ✘ operational (403 `entitlement_missing`) except: personal default workspace bootstrap allowance — see OD-2 (whether a free tier exists is a business decision; the design supports a platform-defined free plan as the mechanism rather than a code exception) | | | |

Invariants: expiry/suspension never deletes or hides the owner's own data from read/export; platform admins can always reach billing/management planes; renewal (manual in v1) reactivates from `past_due/suspended/expired` without data loss.

## 5b. Workspace lifecycle operation matrix (PROPOSED — correction pass; resolves the archived-workspace contradiction)
One consistent rule across the specification and this decision flow:

| Workspace status | Read (detail/list/search) | Write (create/update/delete) | Export | Management (members/roles/settings/activation) |
|---|---|---|---|---|
| `active` | per decision steps 4–10 | per steps 4–10 | per steps 4–10 | per steps 4–10 |
| `suspended` | ✘ 403 `workspace_inactive` | ✘ | ✘ | Platform/org recovery actions only (reactivate) |
| `archived` | ✔ (steps 4–6, 9 read class still enforced: membership + role + entitlement read behavior §5) | ✘ 403 `operation_restricted` | ✔ (member with export-relevant permission) | Owner/Workspace Manager may **restore to active** or request deletion; platform may hard-delete only under OD-11 |

Archived is therefore *read-only preservation*, not denial: historical data stays inspectable by its members while nothing can change. **Archival changes only the permitted operation class — it bypasses nothing.** Read and export in an archived workspace must still pass every applicable check exactly as in an active workspace: current active memberships (steps 4–5; ended/deactivated members lose read access at archival just as before), role permission (step 6), module availability (step 7), organization policy (step 8), subscription entitlement **including the §5 status read/export behavior** (step 9), and the record-ownership rule. A lapsed subscription or removed membership therefore still denies archived reads; archival is a write-freeze, never an authorization shortcut. Remaining product policy — retention period before hard deletion and who may authorize deletion — is **not decided here** (OD-11, approval required); until then no hard-delete capability is designed into any stage.

## 6. Quota & over-limit behavior (PROPOSED)
- Limits come from the effective plan version: max workspaces (per owner), max members per workspace, storage bytes per workspace, plus feature-specific limits declared by modules.
- Enforcement points: workspace creation, invitation acceptance / member add, file upload, module-specific creation endpoints. Denial = 403 `quota_exceeded` with current/limit in the error payload (non-sensitive numbers only).
- Downgrade/over-limit: nothing is deleted; creation paths deny, existing records stay readable/writable except the specific over-limit dimension (e.g. over member limit → cannot add members, existing members unaffected). Storage over-limit → uploads deny, downloads unaffected.
- New modules/features are absent (disabled) in all existing plan versions until a platform admin publishes a plan version enabling them.

## 7. Surfaces
- **HTTP:** controllers resolve context at the boundary (thin adapter per module, Projects pattern), then scope every query with it.
- **Console/queue/ticks:** actor + workspace id are job inputs; the job re-resolves the full decision at execution; denial ends the job as a recorded no-op (audit), not a retry loop. Retryable (503-class) failures may reschedule with backoff.
- **Bale/Google adapters:** external identity → linked `users` row → identical decision calls; adapters hold no permission copies and cannot act for unlinked identities.
- **Platform plane:** platform-role checks are separate from this flow (management endpoints), and never short-circuit steps 1–10.
