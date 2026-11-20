# C7 Runbook: MFA Enrollment, Challenge, and Recovery

Audience: on-call operators and support agents.

## Scope

TOTP MFA (RFC 6238) plus single-use recovery codes for administrative and
step-up flows. C7 ships MFA *infrastructure only* — there is NO silent global
enforcement. Enabling MFA as a login requirement is a separate rollout step
documented separately; until that is executed, users self-enroll optionally
and privileged endpoints are protected by the step-up gate (which returns
`mfa_enrollment_required` for users without a factor).

## Artisan commands

C7 does not ship any interactive MFA CLI commands; all MFA operations are
self-service via `/me/security/mfa/*` or platform-administrative via future
tooling.

## Common operator tasks

### View a user's MFA status

```sql
SELECT id, user_id, type, status, activated_at, failed_attempts, locked_until
FROM security_mfa_factors WHERE user_id = ?;
```

### Force-disable a user's factor (account recovery)

Today there is no dedicated CLI for this; the platform administrator API
`DELETE /platform/security/mfa/users/{user}` is planned for a follow-up.
For emergency access, a database update wrapped in an incident record is
acceptable but must be followed by rotating session tokens.

### Generate new recovery codes

Triggered automatically when a new factor is activated. Support agents
cannot view existing codes; instruct the user to enroll a new factor.

### Unlock a locked factor

Factors auto-lock after 10 failed TOTP attempts for 15 minutes. The lock
expires automatically; do not clear `locked_until` manually unless the
user has verified their identity out-of-band.

## Audit events (security_events.event_type)

- `mfa.enrollment.initiated`, `mfa.enrollment.activated`
- `mfa.challenge.issued`, `mfa.challenge.invalid`, `mfa.challenge.invalid_code`,
  `mfa.challenge.verified`, `mfa.challenge.attempts_exhausted`,
  `mfa.challenge.rate_limited`
- `mfa.recovery.used`, `mfa.recovery.invalid`, `mfa.recovery.rate_limited`
- `mfa.factor.locked`, `mfa.factor.disabled`

Secrets (TOTP codes, recovery codes, secrets) are NEVER written to
`security_events.metadata` — they are redacted by SecurityEventWriter.
