# C7 Frontend Handoff — API Contract

This document is the exclusive integration reference for the frontend
team. No frontend source edits are included in C7.

## Conventions

- All endpoints are under `/api/v1`. Authenticated endpoints require
  `Authorization: Bearer <sanctum-token>`.
- Error responses use `{ "error": { "code": "...", "message"?: "..." } }`
  with stable machine-readable `code` values the UI can branch on.
- Step-up returns HTTP 403 with `error.code = "step_up_required"` and
  `error.scope = "<scope>"` — route the user to the MFA challenge UX.
- Timestamps are ISO 8601 (UTC) strings.

## 1. Self-service security (`/me/security/*`)

All endpoints require Sanctum auth. They act on `$request->user()`.

| Method | Path | Permission | Error codes |
|---|---|---|---|
| GET | `/me/security/mfa` | self | — |
| POST | `/me/security/mfa/begin` | self | `mfa_invalid_state` (409) — factor already active |
| POST | `/me/security/mfa/confirm/{factorId}` | self | `mfa_confirm_failed` (400) |
| POST | `/me/security/mfa/disable` | self | `mfa_verification_failed` (403) |
| POST | `/me/security/mfa/challenge` | self | `mfa_enrollment_required` (403) |
| POST | `/me/security/mfa/verify` | self | `mfa_verification_failed` (403) |
| GET | `/me/security/sessions` | self | — |
| DELETE | `/me/security/sessions/{tokenId}` | self | — |
| POST | `/me/security/sessions/revoke-others` | self | — |
| GET | `/me/security/step-up` | self | — |

### Enrollment flow
1. `POST /me/security/mfa/begin` → `{ factor_id, provisioning_uri, nonce, expires_in_seconds }`
2. Render `provisioning_uri` as a QR code (otpauth://totp/...).
3. User enters 6-digit code; `POST /me/security/mfa/confirm/{factorId}` with `{ nonce, code }` → `{ recovery_codes: string[8] }`. Display these ONCE.

### Verify (step-up) flow
1. Client calls the protected endpoint, receives 403 `step_up_required`.
2. `POST /me/security/mfa/challenge` with `{ purpose: "step_up" }` → `{ challenge_token, expires_at }`.
3. `POST /me/security/mfa/verify` with `{ challenge_token, code, scope }` → `{ verified: true, scope }`.
4. Retry the original request.

### Recovery flow
If the user does not have their TOTP device:
1. Request a challenge with purpose `recovery`.
2. POST verify with `{ challenge_token, recovery_code }` (omit `code`).

### Disable
POST `/me/security/mfa/disable` with `{ challenge_token, code | recovery_code }` — requires a valid challenge first.

## 2. Public endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | Existing liveness |
| GET | `/health/db` | none | Existing DB probe |
| GET | `/maintenance/current` | none | `{ active: { title, scope, scheduled_end }?, next: {...}? }` |

## 3. Platform administration

All routes are under `/api/v1/platform/` and require Sanctum auth plus
the listed platform permission. Step-up requirements are noted.

### Health
| Method | Path | Permission | Step-up |
|---|---|---|---|
| GET | `/platform/health` | `platform.health.view` | no |

### Security events
| Method | Path | Permission | Step-up |
|---|---|---|---|
| GET | `/platform/security/events` | `platform.security.manage` | no |
| GET | `/platform/security/events?event_type=...&actor_user_id=...&per_page=...` | `platform.security.manage` | no |

### Incidents / alerts
| Method | Path | Permission | Step-up |
|---|---|---|---|
| GET | `/platform/incidents` | `platform.incidents.manage` | no |
| GET | `/platform/incidents/{incident}` | `platform.incidents.manage` | no |
| POST | `/platform/incidents` | `platform.incidents.manage` | no |
| POST | `/platform/incidents/{incident}/transition` | `platform.incidents.manage` | no |
| POST | `/platform/incidents/{incident}/assign` | `platform.incidents.manage` | no |
| GET | `/platform/alerts` | `platform.incidents.manage` | no |
| POST | `/platform/alerts/{alert}/acknowledge` | `platform.incidents.manage` | no |
| POST | `/platform/alerts/{alert}/resolve` | `platform.incidents.manage` | no |

Invalid transitions return 409 with `error.code = "invalid_state"`.

### Maintenance windows
| Method | Path | Permission | Step-up |
|---|---|---|---|
| GET | `/platform/maintenance` | `platform.maintenance.manage` | no |
| GET | `/platform/maintenance/current` | `platform.maintenance.manage` | no |
| POST | `/platform/maintenance` | `platform.maintenance.manage` | no |
| POST | `/platform/maintenance/{window}/activate` | `platform.maintenance.manage` | **yes (`maintenance.manage`)** |
| POST | `/platform/maintenance/{window}/complete` | `platform.maintenance.manage` | no |
| POST | `/platform/maintenance/{window}/cancel` | `platform.maintenance.manage` | no |

Overlap / invalid state returns 409 with `error.code = "invalid_window"`
or `error.code = "invalid_state"`.

### Backups
| Method | Path | Permission | Step-up |
|---|---|---|---|
| GET | `/platform/backups` | `platform.backup.manage` | no |
| GET | `/platform/backups/{backupJob}` | `platform.backup.manage` | no |
| POST | `/platform/backups` | `platform.backup.manage` | no |
| POST | `/platform/backups/{backupJob}/execute` | `platform.backup.manage` | no |

### Restore verification
| Method | Path | Permission | Step-up |
|---|---|---|---|
| GET | `/platform/restores` | `platform.backup.manage` | no |
| POST | `/platform/backups/{backupJob}/restore` | `platform.restore.execute` | **yes (`backup.restore`)** |
| POST | `/platform/restores/{verification}/preflight` | `platform.restore.execute` | no |
| POST | `/platform/restores/{verification}/verify` | `platform.restore.execute` | **yes (`backup.restore`)** |

Preflight returns `{ ok: bool, findings: {...} }`. Verify returns 422 on
failure with `{ ok: false, error }`.

## 4. Step-up scopes

| Scope | TTL (minutes) | Triggered endpoints |
|---|---|---|
| `platform.admin` | 15 | Default when no scope specified |
| `maintenance.manage` | 5 | Activate maintenance window |
| `backup.restore` | 5 | Request / execute restore verification |
| `security.manage` | 5 | (reserved for future security config changes) |
| `roles.manage` | 5 | (reserved) |

Step-up state is per-token (Sanctum personal access token), so using a
different session requires a fresh challenge.

## 5. Machine-readable error codes

| Code | Meaning | Client action |
|---|---|---|
| `mfa_enrollment_required` | User has no active MFA factor; endpoint requires MFA to proceed. | Route to enrollment or show MFA enrollment required screen. |
| `mfa_invalid_state` | Factor already active or request in wrong state. | Refresh status. |
| `mfa_confirm_failed` | Nonce or TOTP code did not validate during activation. | Retry enrollment. |
| `mfa_verification_failed` | Challenge/code/recovery did not verify (also covers rate limit). | Show error; offer recovery code path. |
| `step_up_required` | Factor is present but step-up is stale/missing. | Trigger MFA challenge with the `scope` returned in the error. |
| `invalid_window` | Maintenance window overlaps or has invalid start/end. | Adjust times. |
| `invalid_state` | Lifecycle transition not allowed or window not active/scheduled. | Refresh state. |

## 6. Rate limits

- MFA verify: 20 attempts / 5 minutes per user.
- Recovery code verify: 10 attempts / 5 minutes per user.
- Public maintenance endpoint: default Sanctum throttle.

## 7. Not included / out of scope for the frontend

- No global MFA enforcement UX yet — enrollment is self-service only.
- No real notification channel for alerts (log-only); do not build a
  pager/alert center UI until a real channel is attached.
- No user-management of other users' MFA factors in this milestone.
- Backup download endpoints are NOT shipped; backups are operator-only.
- There is no UI for restore verification (operator CLI only).
