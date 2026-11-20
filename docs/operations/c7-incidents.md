# C7 Runbook: Incidents and Alerts

## Console commands

| Command | Purpose |
|---|---|
| `php artisan ops:health-sweep` | Run health probes; raise alerts on degradation (scheduled every 5 minutes). |
| `php artisan ops:alerts:dispatch [--limit=50]` | Flush pending alerts through registered channel adapters (scheduled every minute). |
| `php artisan ops:incidents:open {title} [--severity=] [--source=] [--summary=]` | Manually open an incident (e.g. from an outside signal). |

## Incident lifecycle

```
OPEN -> ACKNOWLEDGED -> INVESTIGATING -> MITIGATED -> RESOLVED
  \                                                     /
   `---------- ACKNOWLEDGED -> RESOLVED (trivial fix) -'
```

Reopening: once RESOLVED, create a new incident with a link back via
`payload.parent_incident_id` (manual; the API forbids moving RESOLVED back).

## Alert deduplication

Alerts carry a `fingerprint` (source + component key). When an alert with
the same fingerprint arrives while an existing alert is OPEN or ACKNOWLEDGED,
its `occurrence_count` is incremented rather than a new alert created.

## Channels

The default adapter is `log` (writes to the application log at `warning`
level). External channels (Bale, webhook, email) are future work; Bale
integration is a stub only per C7 constraints — no real messages are
sent from C7 code. Register adapters by adding to `AlertDispatcher` in
a service provider.

## Common responses

### High rate of alerts
1. Run `php artisan ops:alerts:dispatch` to flush any backlog.
2. Inspect `ops_alerts` with `WHERE status='open'`.
3. Acknowledge via the platform API to stop further notifications for
   known issues.

### Missed pages
Because only the log channel is enabled, there is NO page today. Hook
a real channel during production hardening (out of C7 scope).
