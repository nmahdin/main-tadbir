# Stage C6-4 — React Invitation Page, Verified Email Onboarding & Final C6 Verification — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `1f21412` (C6-3 final). Implementation head: `6922fe0`
(CI SUCCESS on push + PR checks; this report commit follows).
Date: 2026-10-17.

Code Complete: YES / Security Verified (within tested boundaries): YES
/ Dev-CI Ready: YES / Production Operationally Ready: NO — deployment
still requires a real `MAIL_*` transport and the `TADBIR_FRONTEND_URL`
/ link-path configuration from the C6-3 report. No production changes
were made.

## 1. Routes & components (existing design system, no new libraries)

Frontend is the existing React 19 + React Router + Tailwind/Vazirmatn
RTL application; no router redesign, no UI library, no global state
framework was added. New routes in `frontend/src/App.tsx`:

- `/invitations/accept` → `components/invitations/InvitationAcceptPage`
  (public; matches the URL shape produced by the C6-3 mail notifier
  via `config/invitations.php`: `{frontend_base_url}{invitation_path}?token=...`).
- `/verify-email` → `components/invitations/EmailVerifyPage` (public;
  `{verification_path}?token=...&email=...`).
- `/invitations/manage` → `components/invitations/InvitationManagerPage`
  (behind the existing `ProtectedRoute`).

Supporting modules: `src/api/invitations.ts` (C6-3 API client over the
existing `request()` client), `src/invitations/invitationLogic.ts`
(pure, unit-tested flow logic), `src/invitations/invitationSession.ts`
(in-memory secret store). Language/style: Persian RTL, existing
Tailwind patterns, labeled controls, `role=status/alert` live regions,
focus-visible rings, responsive single-column cards (mobile-tested
layout classes; RTL proven by `dir="rtl"` roots matching app chrome).

## 2. Invitation page

Renders only the C6-1 `InvitationPresentation` DTO: organization name,
public logo/description (`settings.public` only), workspace name/
description, intended org/workspace role names + human-readable
summaries, inviter display name, optional message, exact expiry
(localized `fa-IR` rendering), combined-invitation explanation
("accepting creates Organization + Workspace membership"), and the
workspace-prerequisite note. Nothing private is invented or displayed.

Distinct states: loading, missing-link, invalid token, expired,
revoked, already-accepted (minimal, non-enumerating — mirroring the
backend's minimal non-pending preview), network failure with retry,
and the valid review state. Preview is fired once per mount and is
provably non-mutating (backend contract + C6-3 tests).

## 3. Token handling & security controls

- The token is extracted from the query exactly once, copied into
  module memory (`invitationSession`), and immediately removed from
  the address bar with `history.replaceState` (URL-cleaning helpers
  are unit-tested: secrets removed, other params preserved).
- It is never written to localStorage/sessionStorage/cookies,
  analytics, console, error telemetry, screenshots, or navigation
  URLs. Acceptance sends it only in the POST body to
  `/api/v1/invitations/accept`; payload builders are unit-tested to
  contain exactly `{token}` (no actor/role/org/workspace fields can
  be added).
- Both token pages set `Referrer-Policy: no-referrer` for the
  document lifetime and the UI instructs users not to share the link.
  No-store RESPONSE headers remain a deployment concern (the SPA is
  static; documented below) — the API responses themselves already
  carry `no-store` from C6-3.
- Refresh/history behavior: same-tab SPA navigation (login,
  verification) preserves the in-memory token; a full reload or a
  new tab intentionally loses it and the page explains that reopening
  the emailed link is safe (opening never consumes). Acceptance is
  guarded against double submission (ref + disabled state) and
  replay returns the backend's stable 409 rendered as already-accepted.

## 4. Authentication & email-verification continuation

- Unauthenticated: the page offers ورود یا ثبت‌نام, navigating to the
  existing `/login` (AuthModal login/register — no new identity
  system) with React Router `state.from = /invitations/accept`; the
  existing `LoginPage` already honors that continuation safely
  (absolute-path-only). After login the user returns to the review;
  NOTHING is accepted automatically at any point.
- Verified email: signed-in users' state comes from
  `GET /auth/email/verification`. Unverified users get an email entry
  + request flow (validated client-side, C6-3 endpoint authoritative),
  delivery-failure/already-claimed guidance, a "verified — recheck"
  action, and the `/verify-email` continuation: token stripped to
  memory, explicit confirm button (never auto-fired on load),
  login detour supported in-tab, success returns to the invitation
  when a flow is in progress, otherwise explains returning to the
  invitation tab/link.
- Mismatch: acceptance denial `invitation_email_mismatch` renders
  safe guidance plus «خروج و ورود با حساب دیگر» (logout → login with
  continuation). The target email is never exposed by preview and is
  never guessed client-side; the backend remains the final authority
  for every denial/conflict (all mapped to stable Persian messages
  without internal details).

## 5. Invitation management UX

`/invitations/manage` (minimal; no new dashboard subsystem): scope
type (organization / workspace / combined), scope ID inputs, role
selects loaded from the existing scoped-role APIs (numeric-ID fallback
when role listing is not permitted), invitee email, optional message
with 1000-char counter, issue, scoped pending list with revoke,
`email_delivery_status` surfaced honestly (failed → recovery guidance:
share the one-time link manually or revoke + reissue for a fresh
token), and the one-time accept link shown once in component state
with copy/hide controls and sensitivity warnings. Token hashes are
never returned by the API and never displayed or persisted.

## 6. Tests & final C6 verification

Local (pre-push): `npm test` 150/150 (8 new `invitations.test.mjs`
tests: bounded extraction, URL cleaning, token-only payloads,
in-memory lifecycle, status/error mapping, email/message validation,
token-free navigation), `tsc --noEmit` clean, `vite build` clean.
CI at `6922fe0` (push + PR): Pint, full PHPUnit (all C1–C6-3
regressions incl. invitation/email HTTP suites), MySQL migration gate
+ all concurrency suites (acceptance races included), frontend
typecheck/tests/artifact — all SUCCESS. A vite dev preview of the new
routes was smoke-verified (HTTP 200; graceful missing-link and
network-error states without a backend).

Final C6 acceptance sweep (against the stage criteria): a real user
with a valid invitation can complete link → review → login/register →
email verification → explicit acceptance → navigation with no manual
database intervention, assuming a valid mail transport and the
existing username auth/registration flow; combined acceptance yields
exactly the authorized Organization + Workspace memberships (backend
proven; frontend adds no membership logic); public preview leaks no
private data; no token is consumed by preview/login/registration/
verification; no role escalation path exists client-side (token-only
payloads; backend revalidates authority + ceilings at acceptance).

## 7. Remaining deployment-only prerequisites (not blockers in code)

- Real email transport: `MAIL_MAILER` (not `log`/`array`) + standard
  `MAIL_*` settings; `APP_URL`/`TADBIR_FRONTEND_URL` must be the
  public SPA origin so emailed links land on these routes; paths
  overridable via `TADBIR_INVITATION_PATH` / `TADBIR_EMAIL_VERIFICATION_PATH`.
- Serve the SPA with `Cache-Control: no-store` on `/invitations/*`
  and `/verify-email` document responses for defense in depth (the
  pages already enforce referrer/memory discipline client-side).
- Public registration exists via the existing AuthModal (username
  registration; accounts start `pending` per existing policy — an
  account must be ACTIVE to verify/accept; if operations require
  self-service activation, that is an identity-policy decision
  outside C6 scope and is unchanged here).
- The legacy SPA has no Core organization/workspace home pages yet;
  post-acceptance navigation lands on `/dashboard` with the backend
  navigation target preserved for future scope routes (documented
  limitation, not a functional blocker).

PR #14 remains OPEN and unmerged; `main` untouched.
