# Stage C5-4 Completion Report — Subscription Administration APIs, Plan-Change Preview & Confirmation, Final C5 Verification

Final stage of C5. Builds only on existing engines: C5-1 plan catalog/snapshots, C5-2 subscription service/resolver/renewal/periods/audit/idempotency, C5-3 evaluator/guards, C2 `PlatformAuthorizer` + `platform.subscriptions.manage`. No parallel billing/subscription/entitlement/authorization engine was introduced. No payments, invoicing, auto-renewal, self-service, or subscription frontend (out of scope).

## 1. Starting and final HEAD

- Starting baseline: `da1f2c5` (C5-3 close, CI-green).
- Implementation: `b607e8e` (APIs + plan-change engine), tests `5a4974a`, container-cycle fix + fixture/diagnostic iterations, final green HEAD `2341b65` (push run `39039313362` SUCCESS; PR run `39039316977` SUCCESS).
- PR #14 remains OPEN and unmerged; nothing was merged to `main`; production untouched.

## 2. API routes and authorization matrix

All routes under `/api/v1/platform` (Sanctum route group, name prefix `api.v1.platform.`), implemented by the thin `PlatformSubscriptionController` over `SubscriptionService` / `PlanChangePlanner`:

| Route | Operation |
|---|---|
| `GET organizations/{organization}/subscription` | view organization subscription |
| `POST organizations/{organization}/subscription` | initial assignment (201) |
| `GET workspaces/{workspace}/subscription` | view subscription resolved for a workspace (organization-owned → organization subscription; personal → its own) |
| `POST workspaces/{workspace}/subscription` | initial assignment for a personal workspace |
| `POST subscriptions/{subscription}/renew` | manual renewal (optimistic `status_version`) |
| `POST subscriptions/{subscription}/plan-change-preview` | non-mutating impact preview + confirmation token |
| `POST subscriptions/{subscription}/plan-change` | confirmed plan-version change |
| `GET subscriptions/{subscription}/history` | chronological period history (reasons never exposed) |

Authorization (MVP, no new permission invented): every endpoint — reads included — requires `platform.subscriptions.manage`, evaluated by `PlatformAuthorizer`; mutations re-evaluate it inside `SubscriptionService` regardless of the controller. Verified matrix (HTTP tests): unauthenticated → 401; authenticated non-platform user → 403 `platform_forbidden`; legacy Admin (legacy role system) → 403; platform user holding only an unrelated platform permission (`platform.users.view`) → 403; organization owner / workspace manager → 403 (no implicit authority); suspended platform actor → 403 at the identity/platform gate before any service code. Subscription administration grants NO workspace access or workspace permissions; responses contain subscription/plan identity, lifecycle state, and UTC boundaries only — no operational workspace data, and mutation reasons appear only in the platform audit record.

Stable error contract (flat `{message, code}` per platform convention): 403 `platform_forbidden`; 409 `subscription_stale_version`, `subscription_change_preview_stale`, `subscription_exists`, `subscription_correlation_conflict`; 404 `subscription_not_found`; 422 `subscription_plan_mismatch`, `plan_version_not_published`, `usage_unknown`, `reason_required`, validation errors. Every mutation requires an explicit reason, a correlation/idempotency identifier, and (renew/change) the expected `status_version`.

## 3. Preview and confirmation contracts

**Preview** (`PlanChangePlanner`, strictly read-only — zero writes, verified by row-count/status-version/audit assertions; deterministic, verified by identical repeated tokens) reports: owner, current vs target published versions (key, version, grace days), retained/losing/gaining module sets, enabled modules affected per in-scope workspace (ALL organization-owned workspaces; only the personal workspace for personal owners — never other scopes), dependency-eligibility impacts (modules whose prerequisites lose entitlement), per-resource old/new limits with measured usage and status (`ok`/`over_limit`/`unknown`) plus excess, warnings, safe blocking reasons, the proposed effective timestamp, and a sha256 confirmation token fingerprinting subscription id + `status_version`, current/target plan-version ids, per-workspace enabled-module sets, the limit/usage picture, and the effective instant — any renewal, activation change, usage drift, or second plan change invalidates it.

**Confirmation** (`SubscriptionService::changePlan`) runs in one transaction: reauthorize → lock owner row then subscription row (documented C5-2 order) → idempotency-by-correlation (same correlation + same target returns the recorded outcome; correlation reused for a different change → 409 `subscription_correlation_conflict`) → expected `status_version` (409 `subscription_stale_version`) → recompute the preview in-transaction and compare tokens (drift → 409 `subscription_change_preview_stale`) → blocking reasons fail closed → persist target version + audit `subscription.plan_changed` + append-only `plan_change` period (migration `2026_10_15_000012` widens the MySQL operation CHECK to `initial|renewal|plan_change`; SQLite no-op). A failed audit write rolls the entire change back (tested). Confirmation never enables/disables/deletes modules or records, and never grants RBAC.

**Terms semantics (locked design):** a plan change is not a renewal — `expires_at` NEVER moves; grace follows the newly effective published version, except an already-Expired subscription keeps its elapsed `grace_ends_at` (a plan change alone can never revive it; verified: state stays Expired, expired access stays ReadOnly for still-entitled modules and Denied for newly unentitled ones). The effective instant must satisfy lastPeriod.start ≤ effectiveAt ≤ now (no future dating, no predating the current period — retroactive entitlement is never manufactured); for expired subscriptions the recorded instant stays inside the elapsed contractual window so the C5-3 evaluator's period-evidence rule keeps working unchanged. Confirmation revalidates that the target is published and audience-compatible at commit time, not only at preview time.

## 4. History, quota, and usage handling

Canonical resources: `workspaces`, `organization_members`, `workspace_members`, `storage_bytes`. `CoreResourceUsageReader` measures only real persisted Core data: organization workspace count (personal = 1), ACTIVE organization memberships (personal = unknown), the maximum ACTIVE membership count across the owner's workspaces (a per-workspace limit binds at the fullest workspace), and `storage_bytes` = **unknown** (no Files Core exists until C9; any number would be fabricated). Rules enforced in preview and re-checked at confirmation: unknown usage against a finite target limit is a BLOCKING `usage_unknown` reason (a change is never represented as fully validated when a dimension cannot be measured); over-limit downgrades are confirmable only with the excess explicitly previewed as a warning — existing records are preserved, nothing is deleted, and growth enforcement beyond preview disclosure is **deferred to later stages** (documented limitation, never claimed). History responses list operation, plan key/version, effective/expiry/grace UTC boundaries, correlation id, actor id, and timestamp — never reasons.

## 5. Entitlement and grace behavior after a plan change

Runtime evaluation (C5-3 evaluator, unchanged) sees the newly assigned published version immediately: previously enabled modules that lose entitlement are inaccessible at once (evaluator Denied) while their `workspace_modules` activation rows and all data are preserved (verified for projects downgrade); gaining entitlement auto-enables nothing (activation remains an explicit C4 operation). Expired subscriptions never gain Full/Grace from a plan change alone. One integration defect was found and fixed during this stage: `PlanChangePlanner` initially injected `ModuleActivationPlanner`, closing a container cycle (evaluator → `SubscriptionService` → planner → activation planner → entitlement gate → evaluator) that hung the first authenticated mutation request; the planner now reads enabled-module rows directly, keeping the graph acyclic.

## 6. Concurrency, idempotency, and security test evidence

- Domain (`PlanChangeTest`, SQLite): preview diff/dependency/limit reporting + determinism + zero side effects; confirm switches version, keeps expiry, recomputes grace, appends history; unknown-usage block; downgrade preserves activation/records; expired not revived; stale version and changed-activation invalidation; idempotent retry + correlation conflict; audit-failure rollback; non-overlapping chronological history (`initial → plan_change → renewal`); authorization/reason/unchanged-target denials.
- HTTP (`PlatformSubscriptionApiTest`): full authorization matrix above; assign/show/renew/history flow (201/404/409/422 stable codes); preview+confirm over HTTP; consumed token rejected 409 on reuse; history contains no `reason` key.
- MySQL/InnoDB (`PlanChangeConcurrencyMysqlTest`, CI-wired): two concurrent confirmations serialize on the owner→subscription lock order (loser receives lock-wait 1205, then `subscription_stale_version` after winner commits; zero committed `plan_change` periods from the loser); renewal-vs-plan-change race serializes the same way, pre-renewal preview goes stale, fresh preview confirms cleanly, renewal expiry is preserved by the later plan change, exactly one `plan_change` period and one version increment per authorized change — all asserted on committed postconditions.

## 7. Deferred / known limitations (honest)

- Growth enforcement for over-limit resources is preview-disclosure only; no module currently blocks record creation on plan limits (enforcement lands with the owning modules' stages). Never represented otherwise.
- `storage_bytes` remains unmeasurable until C9 (Files Core); any target version capping it is blocked by `usage_unknown` (fail closed).
- Reads use the single MVP permission `platform.subscriptions.manage`; a separate read-only subscription permission can be introduced later through the reviewed provisioning flow if product requires it.
- Published-version immutability and period immutability remain application-level guarantees (documented since C5-1/C5-2); direct-SQL writes bypass them.
- Bootstrap/Recovery remains **NOT PRODUCTION-READY** (execution path via hosting PHP-CLI/cron unverified) — unchanged from C2-5.

## 8. Final C5 readiness assessment

- **Code Complete:** YES for the C5 scope (C5-1…C5-4): plan catalog, subscription ownership/lifecycle/renewal, evaluator + operation-aware guards, expired read-only, administration APIs, plan-change preview/confirmation — all implemented and covered above. C5 is complete pending explicit human acceptance of C5-1…C5-4.
- **Security Verified:** YES within the tested boundaries: authorization matrix (incl. legacy-admin and org-owner denials), transactional audit/rollback, lock-order serialization with committed MySQL postconditions, no reason leakage, no implicit workspace access. MySQL claims rest on committed postconditions, not SQLite.
- **Development-CI Ready:** YES — push run `39039313362` and PR run `39039316977` SUCCESS (SQLite suite, MySQL migration gate + full MySQL concurrency suite incl. the new plan-change suite, frontend gates, Pint).
- **Production Operationally Ready:** NO — and not claimed. Production hosting PHP-CLI/cron execution, production MySQL ≥ 8.0.16 identity, secret custody, and backups remain unverified (Q-02/03/04); Bootstrap/Recovery is labeled NOT PRODUCTION-READY until that verification exists.

## 9. CI links and PR status

- Final CI: push `39039313362` SUCCESS, PR `39039316977` SUCCESS at HEAD `2341b65`.
- PR #14: OPEN, unmerged (`mergeable=MERGEABLE`), head `2341b65` = local = remote. Not merged to `main` per instructions.

## 10. What comes next (not started)

C6 invitations per the approved roadmap, then C7 settings, C8 departments, C9 Files Core (which unlocks real `storage_bytes` measurement), C10 notifications/outbox. Each requires fresh explicit approval. **STOPPED after C5-4 as instructed.**
