# Production Readiness Checklist — Platform Bootstrap/Recovery

Non-destructive verification for the C2-4 operational path on the
current shared hosting (PHP 8.3, Cron available, no SSH/Terminal,
PHP CLI via Cron **unverified**, MySQL version **unconfirmed**).
Nothing here modifies production data; every check is read-only
or writes only to a private log file. Until every item is checked
with evidence, Bootstrap/Recovery is **NOT PRODUCTION-READY**.

## 1. PHP CLI from Cron

- [ ] Create a temporary cron job (every minute):
      `/usr/local/bin/ea-php83 /home/<user>/<app>/artisan platform:operations:process >> /home/<user>/platform-ops.log 2>&1`
      (binary path varies by host — confirm the PHP 8.3 CLI path
      in the hosting panel's PHP/cron documentation).
- [ ] Confirm `platform-ops.log` (outside `public_html`) shows
      `No pending platform operations.` → proves CLI binary, PHP
      version (add `php83 -v | head -1` cron probe if uncertain),
      artisan boot, env loading, and DB connectivity in one shot.
- [ ] Confirm cron errors are captured in the same private log
      and no output is written into any web-served directory.
- [ ] Decide the operating model (standing cron vs one-shot cron
      created per operation and removed after) and document it.

## 2. Filesystem placement & permissions

- [ ] `PLATFORM_OPERATIONS_DIR` resolves outside `public_html`
      (default `storage/app/platform-operations`).
- [ ] Directory permissions deny other hosting accounts
      (0700/0750 where the host supports it); `processed/`
      archives are not web-accessible (request the URL → 404/403).
- [ ] `.env` is not web-accessible (request `/.env` → 404/403).

## 3. Secret custody

- [ ] `PLATFORM_OPERATIONS_SECRET` set in server `.env` only;
      a copy held in the operator's password manager; value
      appears nowhere in git, tickets, or chat.
- [ ] Token issuance happens off-host (operator machine) wherever
      possible; on-host `platform:operations:issue` is treated as
      equivalent to full operator authority.
- [ ] Rotation procedure rehearsed in staging (rotation kills
      outstanding tokens instantly).

## 4. Production MySQL

- [ ] `SELECT VERSION();` recorded (≥ 8.0.16 required for the
      C2-1 CHECK enforcement) — **currently unknown**.
- [ ] InnoDB confirmed as the engine for platform tables.
- [ ] Migration dry-run performed against a restored backup
      copy, never first against production.

## 5. Backup & recovery prerequisites

- [ ] Database backup taken and restore-tested before first
      bootstrap; backup includes `platform_*`, `audit_logs`,
      `users`, `core_*` tables.
- [ ] Rollback policy understood: C2-1/C2-4 migration rollbacks
      refuse while platform history exists (by design).
- [ ] Incident-evidence channel agreed (ticket system IDs used
      as evidence references in recovery tokens).

## Sign-off record

| Item | Evidence (link/path) | Date | Operator |
| --- | --- | --- | --- |
| PHP CLI probe | | | |
| MySQL version | | | |
| Secret provisioned | | | |
| Backup restore test | | | |

Status at C2-5 completion: **none of the production checks above
have been executed** (no production access was used or granted).
Bootstrap/Recovery remains **NOT PRODUCTION-READY** until they
are.
