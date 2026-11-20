# C7 Runbook: Backups

## Console commands

| Command | Purpose |
|---|---|
| `php artisan ops:backup-run [jobId]` | Execute a pending backup job (scheduled daily at 02:30 UTC). |
| `php artisan ops:health-sweep` | Health sweep flags backup freshness >26 h as degraded. |
| `php artisan ops:backup:verify-restore [--backup=ID] [--preflight-only]` | Run isolated restore verification (see c7-restore.md). |

## Storage layout

- Backups land on the `local-backup` disk (`storage/app/backups/` by
  default). This directory is NOT under the public web root and is
  NOT inside the DAM asset tree.
- Each job writes to `backups/{job_uuid}/` containing:
  - `database.sql` — database dump (production deployments should
    replace the stub generation in `BackupService::dumpDatabase()`
    with a real `mysqldump`/`mariadb-dump` invocation).
  - `files.tar` — file archive (stubbed).
  - `manifest.json` — artifact names, sizes, SHA-256 hashes,
    `schema_version`, created_at.
- SHA-256 hashes are computed over each artifact at backup time and
  verified during restore preflight.
- `.env` and encryption keys are NOT bundled; the file archive
  intentionally excludes storage keys.

## Retention

Jobs are created with a default retention of 14 days (`retention_until`).
A separate cleanup command may be added later; today old backups must
be pruned manually.

## Requesting an ad-hoc backup

`POST /platform/backups` with optional `type` (default `full`); then
`POST /platform/backups/{job}/execute` (or run the artisan command).

## Inspecting the last backup

- `GET /platform/backups/{job}` returns status, manifest, checksum, size.
- Health endpoint includes `backups.status` and `last_succeeded_at`.

## Restoring

See `docs/operations/c7-restore.md`. NEVER restore into production,
shared, or operator (Laragon) databases from this workflow.
