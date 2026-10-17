# Stage C6-3 — Invitation Management APIs, Public Preview, Acceptance Endpoint & Email Delivery — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `29ab372` (C6-2 final). Implementation head: `6478b0d`
(CI SUCCESS on push + PR checks; this report commit follows).
Date: 2026-10-17.

Code Complete: YES / Security Verified (within tested boundaries): YES
/ Dev-CI Ready: YES / Production Operationally Ready: NO — a real
MAIL_* transport and the C6-4 pages are still required before real
users can complete the flow (see §5/§8).

## 1. HTTP endpoints & authorization

All controllers are thin (`App\Http\Controllers\Api\V1\Core\*`);
every authorization decision stays inside the C6-1/C6-2 services.
Errors are flat `{message, code}` with stable domain codes mapped
to HTTP statuses (403 authority/ceiling/mismatch, 404 unknown,
409 state conflicts, 422 validation-state, 502/503 delivery).

Invitation administration (Sanctum + active-account):

- `POST /api/v1/core/organizations/{organization}/invitations` —
  organization invitation.
- `POST /api/v1/core/workspaces/{workspace}/invitations` —
  workspace invitation.
- `POST /api/v1/core/workspaces/{workspace}/combined-invitations` —
  combined invitation (both role ids; organization derived from the
  persisted workspace).
- `GET /api/v1/core/organizations/{organization}/invitations`,
  `GET /api/v1/core/workspaces/{workspace}/invitations` — scoped
  lists (new `InvitationService::listForOrganization/Workspace`,
  same `*.members.manage` authority as issuance; organization
  membership alone confers NO workspace invitation visibility).
- `POST /api/v1/core/invitations/{invitation}/revoke`.

Issuance enforces C6-1 authority + independent Grant Ceilings per
scope and C3 lifecycle (suspended/ended organizations deny
issuance/acceptance) entirely in-service. Responses present an
allowlist (id, type, target email, role-intent ids, effective
status, expiry, timestamps) — NEVER a raw token or token hash in
lists/revokes. The raw token appears exactly once, in the issuance
response to the authorized inviter (`invitation_token` +
`accept_url`), the same one-time channel the invitation email
uses. Bounded validation: email format, integer role ids,
message ≤ 1000 chars, optional ISO expiry.

Acceptance: `POST /api/v1/invitations/accept` (authenticated,
throttled 10/min) accepts ONLY `{token}`. Actor, memberships,
roles, and target scope always come from the authenticated
identity and the persisted invitation; client-supplied override
fields are never read (proven by test). Returns the C6-2
`InvitationAcceptanceResult` projection incl. `navigation_target`
only after the atomic transaction commits.

Verified email (authenticated, throttled 5/min request,
10/min confirm):

- `GET /api/v1/auth/email/verification` — own address + verified
  state (the only place the owner sees their own email; the User
  model keeps it hidden everywhere else).
- `POST /api/v1/auth/email/verification/request` → 202.
- `POST /api/v1/auth/email/verification/confirm` — token only;
  challenge is independent of invitation tokens, hash-only at
  rest, single-use, exact-expiry; changing address invalidates
  prior verification. Raw challenges never appear in responses,
  logs, or audit.

## 2. Public presentation contract

`POST /api/v1/invitations/preview` (unauthenticated, throttled
20/min). The token travels in the POST body — never in a URL that
access logs, proxies, or referrer headers could capture. Backed
by the C6-1 `InvitationPresentation` DTO (public `settings.public`
organization description/logo only, names, role display summaries,
inviter display name, optional message, exact expiry,
`will_create_organization_membership`). Revoked/expired/accepted
invitations collapse to a minimal `{status}` with NO scope
details; unknown tokens return a stable 404 `invitation_not_found`.
Responses carry `Cache-Control: no-store, private`,
`Referrer-Policy: no-referrer`, `nosniff`. Preview never consumes
or mutates (proven: preview → still pending → acceptance works).
The token-bearing pages this serves are C6-4; the required
no-store/no-referrer rendering and login/registration continuation
(identity preserved; verification only during authenticated
acceptance; no acceptance on GET/login/registration) are recorded
as C6-4 integration requirements in `config/invitations.php`.

## 3. Mail delivery adapter & environment

- `App\Core\Identity\MailEmailVerificationDelivery` now binds the
  C6-2 `EmailVerificationDelivery` port (the fail-closed
  `UnavailableEmailVerificationDelivery` remains an explicit
  override). `App\Core\Invitations\InvitationEmailNotifier` sends
  invitation mail once per issuance, after the issuance
  transaction commits — never for rolled-back state, never
  retried (duplicate-pending conflicts also prevent re-sends;
  recovery from failure = revoke + reissue with a fresh token).
- Delivery failure is explicit: transport exceptions become
  `email_delivery_failed` (502 on verification request; the
  committed challenge stands and retry supersedes it) and
  `email_delivery_status: "failed"` on issuance (invitation
  persists; nothing claims false success). Neither tokens nor
  recipient addresses are logged (failure log carries only the
  invitation id).
- Production guard (`MailTransportGuard`): outside local/testing,
  `log`/`array`/unset mailers throw `email_delivery_unavailable` —
  they can never masquerade as successful delivery. Tests use
  `Mail::fake()` + a broken-SMTP configuration to prove both the
  success path (fake) and the explicit failure path (refused
  connection), plus escaped HTML/plain-text rendering of both
  mailables (`App\Mail\*`, `resources/views/emails/*`).

Required environment (no credentials invented or committed):

- `MAIL_MAILER` (a real transport, e.g. `smtp`) + the standard
  Laravel `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`,
  `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`,
  `MAIL_FROM_NAME` as applicable to the chosen transport.
- `APP_URL` (or `TADBIR_FRONTEND_URL`) — public base URL used in
  emailed links; optional `TADBIR_EMAIL_VERIFICATION_PATH`
  (default `/verify-email`) and `TADBIR_INVITATION_PATH`
  (default `/invitations/accept`) — the C6-4 pages must serve
  these paths.

## 4. Security & rate-limit coverage

HTTP tests (`InvitationApiTest`, `EmailVerificationApiTest`):
org/workspace/combined issuance; unauthorized + ceiling denials
(403 with stable codes); duplicate-pending 409 with exactly one
email sent; preview without mutation + privacy (no email/token/
hash in payloads) + minimal non-pending status + rate limit 429;
verified-email requirement and mismatch 403; override fields
ignored; combined membership creation + existing-org-role
preservation through HTTP; repeat acceptance 409 without
duplication; revocation endpoints (409 on repeat); suspended-org
issuance + acceptance denial without consumption; verification
expiry at the exact instant; cross-account challenge rejection;
rate limits on request/confirm/preview/accept; mail adapter via
framework fakes, transport failure, production guard, escaped
content. MySQL acceptance concurrency regressions and the full
C1–C6-2 suites remain green in CI.

## 5. Remaining C6-4 frontend requirements

- React invitation page at `TADBIR_INVITATION_PATH` (default
  `/invitations/accept`): reads token from query, POSTs preview,
  renders the `InvitationPresentation` contract, then guides
  login/registration and POSTs acceptance with the same token;
  must render token-bearing pages `no-store` + `no-referrer`,
  never log or forward the token, and navigate via the returned
  `navigation_target`. Acceptance must never fire on page view,
  login, or registration alone.
- Email-verification page at `TADBIR_EMAIL_VERIFICATION_PATH`
  (default `/verify-email`): confirms via the authenticated
  confirm endpoint (token + email arrive as link query params).
- Invitation management UI over the §1 endpoints, surfacing
  `email_delivery_status` and the revoke + reissue recovery path.
- A real `MAIL_*` transport in the deployment environment.

## 6. Scope discipline

No second invitation/membership engine (services reused as-is;
the only service addition is the two authority-checked list
queries), no queue/notification/bulk-email subsystem, no
registration/login redesign, no subscription/module changes, no
raw challenge in any response. PR #14 remains OPEN and unmerged;
`main` untouched; no production changes.
