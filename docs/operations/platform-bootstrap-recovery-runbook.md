# Runbook — Platform Bootstrap & Emergency Recovery (Stage C2-4)

Audience: the infrastructure operator. These operations grant the
most powerful role in the system. There is **no HTTP path** — by
design — and a Legacy Admin account has **no authority** here.

## Trust boundary (read first)

- Authority comes from exactly one thing: possession of
  `PLATFORM_OPERATIONS_SECRET`, an HMAC key held by the
  infrastructure operator. Whoever holds it can mint valid
  operation tokens; the application cannot distinguish operators
  beyond the `operator` identifier bound into each token (which is
  recorded in the audit trail).
- **If the shared-hosting account itself is compromised, this
  mechanism is compromised too** (the attacker can read the env
  secret and the database). The design limits, but cannot
  eliminate, that risk: tokens are single-use, expire within at
  most `PLATFORM_OPERATIONS_MAX_TTL` seconds (default 3600), are
  bound to one operation, one target, and one request ID, and
  every consumption is audit-logged. Rotate the secret immediately
  after any suspected hosting compromise (rotation invalidates all
  outstanding tokens — there is no grace window).
- Secrets never appear in code, git, request files beyond the
  token itself, logs, or command output.

## Secret provisioning & rotation

1. Generate a secret of at least 32 random bytes (password manager
   / `openssl rand -hex 32` on a trusted machine).
2. Set `PLATFORM_OPERATIONS_SECRET` in the application `.env`
   (server-side only) and store a copy in the operator's password
   manager. Clear config cache after changes (`php artisan
   config:clear` where CLI exists, or the panel's equivalent).
3. Rotation = replace the value in both places. Outstanding
   tokens die instantly; consumed operations are unaffected.

## One-time bootstrap

Preparation:
1. Confirm the target user exists and is `active` (an operator or
   admin verifies the account in the normal user administration).
2. On a machine holding the secret, issue the token:
   `php artisan platform:operations:issue --operation=bootstrap --target=<username> --operator=<operator-id>`
   (run via the operator's own Laravel checkout/console — the
   command only signs; it does not touch the production DB).
3. Transfer the single-line token to the production host through a
   trusted channel.

Execution (production), either channel:
- **One-shot cron / any PHP CLI:** `php artisan platform:operations:execute "<token>"` (or `--file=<path>`).
- **File drop:** place the token as the only content of
  `<PLATFORM_OPERATIONS_DIR>/bootstrap.opreq` (default
  `storage/app/platform-operations/`, **outside public/**), then
  run `php artisan platform:operations:process` once (manually or
  via a cron line the operator creates and afterwards removes).

Result: the target becomes the first Primary Administrator, the
bootstrap marker is set, and bootstrap is permanently closed —
including against marker tampering, because any historical
primary assignment also closes it. Verify afterwards in the audit
log (`platform.bootstrap_completed`, actor empty, your operator ID
in the summary).

## Emergency recovery

Preconditions, all fail-closed:
- Bootstrap completed earlier; **no usable Primary Administrator**
  exists (usable = active account + unrevoked primary assignment).
  A primary whose password is merely *believed* lost while the
  account is active does **not** qualify unless the account's
  status makes it non-operational — the operator claim alone is
  never sufficient.
- Independent verification has actually happened outside the app
  (identity check via hosting panel/ticket with the account
  owner, recorded as evidence references).
- Target is an existing, operationally **active** user. Deactivated
  accounts are never resurrected by recovery.

Issue with full incident metadata:
`php artisan platform:operations:issue --operation=recovery --target=<username> --operator=<id> --incident-id=INC-123 --reason="..." --evidence=ticket:123 --evidence=identity:video-9 --verification-method=hosting_panel_identity --verification-reference=ticket:123`

Execute exactly like bootstrap. Effects: the target receives the
primary role (any active non-primary role they held is
soft-revoked in the same transaction), and
`platform.emergency_recovery` is audited with incident ID, reason,
evidence, and verification references. Recovery closes itself the
moment a usable primary exists again; there is no standing
emergency account.

## Failure & replay handling

- Every rejection prints a stable code, e.g. `bootstrap_closed`,
  `recovery_not_needed`, `incident_evidence_missing`,
  `token_expired`, `token_signature_invalid`, `request_replayed`,
  `target_not_operational`. Rejections never change state;
  verifiable rejections are additionally recorded (without any
  secret material) in `platform_operation_requests` as diagnostics.
- A token that was consumed once can never be replayed
  (`request_replayed`; the unique request ID + control-row lock
  make this race-proof, proven on MySQL).
- If execution fails mid-operation, the whole transaction rolled
  back: no partial grant, no marker change, no consumption.
  Diagnose, fix the cause, issue a **new** token (new request ID).

## Cron / PHP CLI prerequisites on shared hosting (outstanding)

It is **not yet verified** that the production host executes PHP
CLI via cron. Before relying on it, run this safe capability
check (creates/removes nothing outside a temp file; skip it if no
CLI channel exists at all):

1. Add a temporary cron line (once per minute):
   `/path/to/php83 /home/<user>/public_html/backend/artisan platform:operations:process >> /home/<user>/platform-ops.log 2>&1`
   On cPanel multi-PHP hosts the binary is typically
   `/usr/local/bin/ea-php83`. The log file must live outside
   `public_html`.
2. Confirm the log shows `No pending platform operations.` —
   that proves PHP version, artisan boot, and DB connectivity in
   one shot. Then remove or keep the cron line per your operating
   model, and delete the log.
3. Also outstanding before production use: confirm the production
   MySQL version is ≥ 8.0.16 (required by C2-1 CHECK enforcement).

**If PHP CLI truly cannot run**, the supported alternative is to
execute the same Artisan commands later from a VPS (identical
code path, same secret rules) — there is intentionally **no HTTP
fallback** and none must be improvised.

## Future VPS execution

Identical: provision the secret via environment, then
`platform:operations:issue` / `execute` / `process` from a
controlled shell. No code or token-format change is required.
