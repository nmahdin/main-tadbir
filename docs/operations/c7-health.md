# C7 Runbook: Health Endpoints

## Public endpoints (no auth)

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Legacy health (returns fixed JSON). |
| `GET /api/v1/health/db` | DB-only probe. |
| `GET /api/v1/maintenance/current` | Current/next maintenance window. |

## Authenticated diagnostics

`GET /api/v1/platform/health` requires `platform.health.view` and
returns readiness plus:
- queue backlog + failed-job counts
- backup freshness
- active/next maintenance
- open incident count

Liveness is a trivial 200 with no I/O; readiness probes DB, cache and
local storage with sub-second timeouts. Exception details, SQL, DSNs
and environment values are never included.

## Scheduled sweep

`ops:health-sweep` every 5 minutes raises alerts (fingerprinted) for
any degraded component or >100 failed jobs.
