# Stage C2-5 completion report — C2 final security, integration & operational readiness

Branch `arena/582a70e5-main-tadbir` (PR #14, open, unmerged),
pending explicit human acceptance. This report closes the C2
technical-acceptance pass over C2-1…C2-4.

## Status separation (deliberately not equivalent)

| Status | Verdict |
| --- | --- |
| **Code Complete** | Yes — C2-1…C2-5 implemented; no approved-scope gaps remain in code. |
| **Security Verified** | Yes, *within the trust boundary stated below* — the boundary's key limitation is recorded as a limitation, not hidden. |
| **Development/CI Ready** | Yes — full SQLite + real-MySQL suites, Pint scope, frontend CI gates, and migration gates green. |
| **Production Operationally Ready** | **NO — NOT PRODUCTION-READY.** The production PHP-CLI execution path is unverified, the production MySQL version is unconfirmed, and production secret custody/backups are unprovisioned. See `docs/operations/production-readiness-checklist.md`. No production access was used. |

## Findings

### Confirmed defects (fixed)
1. **Future-issued operation tokens were accepted** (no `iat`
   sanity check). Fixed in `OperationTokenVerifier`: tokens
   issued more than 300 s in the future are rejected; TTL cap
   enforcement unchanged. Covered by the existing token-security
   tests plus the verifier contract.
2. All other C2-5 failures encountered during verification were
   defects in the *new test code* (wrong error-shape field,
   wrong field name `permission_keys` vs the actual `permissions`,
   stale `version` values, over-broad route scan) — corrected
   against the real contracts; no silent app changes were needed.

### Limitations (accepted, documented, not bypassed)
1. **Operator independence is organizational, not cryptographic,
   on a single shared-hosting account.** The HMAC secret lives in
   the server `.env` and in the operator's custody. Anyone with
   hosting-account file/CLI access can read it and can run the
   signer; a *normal authenticated application user cannot* (no
   HTTP route exists — proven by route scan and 404 probes; the
   processor only reads the configured private directory —
   proven by test). Therefore HMAC authenticates "holder of the
   secret", not by itself a distinct verified human. Independent
   authorization rests on custody and process (off-host issuance,
   incident verification evidence), exactly as the runbook
   states. If the hosting account is compromised, this mechanism
   is compromised; rotation invalidates all outstanding tokens.
2. Tokens passed as CLI arguments are visible wherever the cron
   definition is visible; single-use + ≤ 1 h TTL bound the risk.
3. Rejected-request diagnostics (`platform_operation_requests`)
   are best-effort and may be absent under database failure;
   successful operations never depend on them.

### Unverified assumptions (no evidence collected)
- Production PHP CLI execution via cron; exact production MySQL
  version (≥ 8.0.16 assumed); storage-directory permissions
  against other hosting accounts; backup/restore viability.
  Each has a non-destructive check in the readiness checklist.

## Verification added in C2-5

- `PlatformSecurityIntegrationTest` (10 tests): platform↔workspace
  HTTP disjointness; legacy admin 403 on all platform endpoint
  groups; suspended/deactivated platform accounts denied; Grant
  Ceiling enforced via API on role edit, grant, and replace;
  version conflict preserves role data; audit endpoint never
  returns unmasked secrets (nested keys included); **no
  bootstrap/recovery/operations HTTP routes exist**; payload
  tampering and wrong-secret forgery fail closed; the file
  processor reads only the configured directory and its output
  (and issuance output) never contains the secret or token.
- `PlatformMigrationVerificationTest` (5 tests): permission
  scope CHECK rejects unknown scopes; generated-column uniqueness
  blocks a second active assignment across different roles;
  repeated catalog sync + provisioning never expand privileges
  and assign nobody; a missing control row fails closed
  (partial-migration detection); C2-1/C2-4 rollbacks refuse while
  platform history exists and leave schema/data intact.
- `PlatformAuditFailureTest` (3 tests): injected audit-storage
  failure rolls back grant, bootstrap, and recovery completely
  (no assignments, no marker change, no consumed requests).
- `PlatformInvariantsConcurrencyMysqlTest` (6 tests, real
  InnoDB): last-primary revoke race, suspension race (both end
  with the primary intact and usable exactly once), replacement
  race (exactly one active assignment afterwards), shared-role
  permission-edit race, replay of a consumed request across
  contention (still `request_replayed`, one grant), and audit
  failure rollback on MySQL. Every scenario asserts committed
  postconditions after contention, not merely lock blocking.
- Regression: C1, C1-H1 (incl. MySQL identity concurrency),
  C2-1…C2-4 suites, 03A–04B, and the frontend
  lint/typecheck/tests/build CI job all remain green. Local
  frontend execution was not available in the sandbox (no
  `node_modules`); the repository's own CI frontend job is the
  evidence.

## Remediation summary

One verifier hardening (future-`iat` rejection). No changes to
C1/C2-1…C2-3 behavior, no architecture changes, no HTTP fallback
added, no legacy break-glass, no permanent emergency account.
