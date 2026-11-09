# Stage C2-4 completion report — secure platform bootstrap & emergency recovery

Status: implemented on PR #14 (branch `arena/582a70e5-main-tadbir`),
pending explicit human acceptance. Operator runbook:
`docs/operations/platform-bootstrap-recovery-runbook.md`.

## Execution contract (no HTTP path exists)

- **Operational authorization:** single-use operation tokens,
  `base64url(json).base64url(HMAC-SHA256)`, signed with
  `PLATFORM_OPERATIONS_SECRET` (env-only, operator-held, never
  committed/logged). Payload binds operation type, unique
  `request_id`, target username, operator identity, `iat`/`exp`
  (TTL capped by `platform.operations.max_ttl_seconds`, default
  3600), and for recovery the full incident block. Verification
  (`OperationTokenVerifier`) fails closed on missing secret,
  malformed/tampered/expired/over-long tokens, using constant-time
  signature comparison.
- **Replay prevention:** `platform_operation_requests` (migration
  `2026_10_15_000007`) with a UNIQUE `request_id`; consumption is
  written inside the operation transaction under the platform
  control lock. Rejected verifiable requests are recorded
  separately as `rejected` diagnostics — no secret material is
  ever stored.
- **Execution adapters (Artisan only):**
  `platform:operations:issue` (operator-side signing; prints only
  the token), `platform:operations:execute` (one-shot, argument or
  file), `platform:operations:process` (cron-friendly processing
  of `*.opreq` files from `PLATFORM_OPERATIONS_DIR`, default
  `storage/app/platform-operations` — outside any publicly served
  path; processed files are archived, never left pending). The
  domain service (`PlatformOperationService`) is transport-blind
  and identical for shared hosting and a future VPS. No HTTP
  fallback was created.

## Bootstrap (exactly once)

Under the control lock, in one transaction: provisioner ensures
the protected primary role → reject if the completion marker is
set (`bootstrap_closed`) → reject if **any** primary assignment
has ever existed (`bootstrap_history_exists`, so marker tampering
cannot reopen it) → target must exist and permit operational
access (`target_not_operational`; deactivated targets can never
be resurrected) → grant with `granted_by_user_id = null` → set
marker + bootstrapped user → consume request → audit
`platform.bootstrap_completed` with **actor null** and the
operator identity in the summary. Legacy admin status is neither
consulted nor rewarded anywhere.

## Emergency recovery (fail-closed)

Same lock and transaction shape. Requires: bootstrap previously
completed; complete incident metadata (ID, reason, ≥1 evidence
reference, independent verification method + reference) —
anything missing is `incident_evidence_missing`; **zero usable
primaries** in database-observable terms (active account +
unrevoked primary assignment), otherwise `recovery_not_needed`.
An active primary merely *claimed* locked out remains usable and
blocks recovery; unverifiable assertions fail closed. On success
the target's active non-primary role (if any) is soft-revoked and
the primary granted atomically; `platform.emergency_recovery` is
audited with the full incident record. Recovery creates no
standing emergency account and closes itself as soon as a usable
primary exists again.

## Verification

- `PlatformOperationsTest` (SQLite, 9 tests): bootstrap success +
  permanent closure; history-based closure despite marker loss;
  non-operational target rejection + rollback (marker unconsumed,
  no consumption record); token expiry/tamper/malformed/replay;
  legacy-admin non-authority (audit actor null, nothing granted);
  recovery gating (pre-bootstrap, usable-primary, missing
  evidence, unverifiable lockout, deactivated target); approved
  recovery with incident audit; Artisan issue→execute round-trip
  (+ CLI replay failure); bootstrapped primary still has zero
  workspace access.
- `PlatformOperationsConcurrencyMysqlTest` (real InnoDB):
  concurrent bootstraps — loser verifiably blocks on the control
  lock, winner completes through the real service, competitor is
  then rejected, and committed state shows exactly one active
  primary + marker set once; concurrent recoveries — same shape,
  ending with exactly one usable primary and the second recovery
  rejected as `recovery_not_needed`.
- Full regression (C1, C1-H1, C2-1…C2-3, 03A–04B, all MySQL
  suites) green in CI.

## Outstanding operational risks / prerequisites

- Production PHP-CLI-via-cron is **unverified**; the runbook
  contains a safe, non-destructive capability check. If CLI is
  impossible on the host, the supported path is later VPS
  execution of the same commands — deliberately no HTTP fallback.
- Production MySQL version (≥ 8.0.16 required since C2-1) is
  still unconfirmed.
- The shared secret is a single factor: hosting-account
  compromise defeats it (documented trust boundary); rotation
  invalidates all outstanding tokens immediately.
- Until the first bootstrap is executed in production, the
  platform has no administrator — expected pre-launch state.
