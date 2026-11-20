# C7 Runbook: Maintenance Windows

## Console commands

There are no CLI commands for maintenance in C7; all scheduling and
activation goes through the platform API and requires step-up
(`step-up:maintenance.manage`).

## Lifecycle

1. **Schedule** a window (title, scope, start/end). Overlaps are rejected.
2. **Activate** when ready. This is the step-up-gated action.
3. **Complete** after the work finishes.
4. **Cancel** before activation if the window is abandoned.

## Public endpoint

`GET /api/v1/maintenance/current` returns `active` and `next` window
summaries for client banner rendering. It does NOT require authentication.

## Rules

- DB-driven; `php artisan down` is NOT used (would take the API down
  for all clients including platform admins).
- Emergency bypass is intentionally unbounded in time — activate only
  during scheduled windows; the system will reject overlapping windows.
- Activation during local/dev is NOT permitted by configuration; the
  code path is tested but never executed in development.
