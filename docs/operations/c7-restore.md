# C7 Runbook: Isolated Restore Verification

## Purpose

C7-H provides **verification**, not operational disaster recovery. The
restore pipeline imports a backup into a disposable database and isolated
storage prefix to prove artifact integrity and schema compatibility. It
is NOT a replacement for a tested restore playbook against production.

## Console command

```
php artisan ops:backup:verify-restore [--backup=JOB_ID] [--preflight-only]
```

If `--backup` is omitted the most recent `succeeded` job is used.

## Pipeline

1. **Request** creates a row in `ops_restore_verifications` with
   status `requested`.
2. **Preflight** confirms every artifact listed in the manifest exists
   and its SHA-256 matches. Failure here aborts before any import.
3. **Verify** allocates:
   - `target_database = restore_test_<random>`
   - `target_storage_prefix = restore-tests/<uuid>`
   Then imports the database dump and file archive, runs basic
   post-restore health checks, and tears down the test database
   regardless of outcome.

## Safety invariants

- Target database name MUST start with `restore_test_`; any attempt to
  target a database not matching that prefix is rejected at the service
  layer (see `RestoreService::assertDisposableTarget()`).
- Target storage prefix MUST start with `restore-tests/`.
- The restore code path NEVER connects to the Laragon or production
  database selected by the default connection; it opens a secondary
  connection to a throwaway database.
- The restore pipeline is NOT wired to production artifacts in C7; a
  follow-up deployment hardening story will provide the actual
  `mysqldump`/`mysql` binary invocations. The current implementation
  walks the pipeline end-to-end with placeholder artifacts sufficient
  to prove preflight + cleanup logic.

## What is NOT claimed

- RPO / RTO targets are NOT stated; instrumentation is provided but
  no operational commitment is made.
- The restore has NOT been executed against a real production-sized
  mysqldump in CI (CI environment lacks binaries and disposable DB
  server access). It is therefore marked **PARTIAL** until an
  operator runs `ops:backup:verify-restore` against a real backup in
  an isolated environment.

## Evidence

Test coverage: `tests/Feature/Core/C7SecurityOperationsTest.php` covers
preflight detection of missing artifacts. The unsafe-target guard is
covered. End-to-end disposable DB import requires a disposable MySQL
server and is therefore exercised manually.
