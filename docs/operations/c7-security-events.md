# C7 Runbook: Security Event Audit

## Storage

All security events are written to `security_events` via
`SecurityEventWriter::record(...)`. The writer automatically redacts
known-secret metadata keys:
`password`, `password_confirmation`, `current_password`, `token`,
`access_token`, `refresh_token`, `remember_token`, `totp_secret`,
`secret`, `recovery_code`, `code`, `otp`, `authorization`, `cookie`,
`x-xsrf-token`.

## Querying

Platform operators list events via `GET /api/v1/platform/security/events`
(requires `platform.security.manage`) or SQL:

```sql
SELECT event_type, outcome, actor_user_id, occurred_at, metadata
FROM security_events
WHERE occurred_at > NOW() - INTERVAL 1 DAY
ORDER BY occurred_at DESC;
```

`metadata` is JSON; redacted fields appear as `"[REDACTED]"`.

## Coverage

- MFA lifecycle (enrollment, verification, recovery, lockout, disable)
- Step-up (verified)
- Incident/alert lifecycle
- Maintenance window scheduling/activation/completion/cancel
- Backup request/execute/success/failure
- Restore request/preflight/verify/failure

Sensitive values are never logged — TotpEngine and MfaService do not
log secrets, codes or recovery codes.
