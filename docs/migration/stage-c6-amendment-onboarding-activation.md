# C6 Amendment — Invitation Onboarding Without Manual Activation

Product-owner decision (2026-10-17), implemented as a small follow-up
on the C6 branch (PR #14, open/unmerged). Baseline: C6-4 final
`00c365b`.

## Decision

Invitation-based onboarding must not require manual account
activation. A user registering through a valid invitation becomes
eligible for invitation acceptance after successful email
verification — with no administrator approval step — while the
invitation itself is never auto-accepted and no unrelated lifecycle
control is weakened.

## What changed (backend only; no schema, no frontend changes)

1. **Login** (`AuthController::blockedMessage`): `pending` accounts
   may now authenticate with the existing username credentials.
   `blocked` / `inactive` / `suspended` / `deactivated` still deny at
   login. Login alone never activates the account.
2. **Middleware** (`EnsureActiveAccount`): a pending account may
   reach ONLY the verified-email endpoints
   (`api.v1.auth.email.verification.*`) plus logout. Every other
   authenticated endpoint — including invitation acceptance —
   still requires an active account; suspended/deactivated/blocked/
   inactive accounts receive no exception anywhere.
3. **Activation at verification** (`EmailVerificationService::confirmEmail`):
   inside the existing confirmation transaction, after the address
   is marked verified, a PENDING account is set to `active` only
   when a live invitation (status `pending`, `expires_at` in the
   future, row locked against concurrent revoke/accept) targets the
   just-verified normalized address. Audited as
   `identity.account_activated_via_invitation` (with the invitation
   id). No other status is ever modified here — verification never
   reverses suspension or deactivation.

## Preserved guarantees (all covered by tests)

- Username authentication unchanged; verified-email match still
  required at acceptance; `InvitationAcceptanceService` remains the
  final authority (active accepter, inviter reauthorization, Grant
  Ceilings, atomic membership creation, single-use token).
- Verification ≠ acceptance: after activation the invitation stays
  pending and zero memberships exist until the explicit acceptance
  call. The backend `navigation_target` contract is unchanged and
  remains the single navigation source for future workspace routes.
- Verification without a live invitation (none / revoked / expired)
  does not activate — there is no general self-activation path.
- Focused suite: `InvitationOnboardingActivationTest` (full
  register → login → verify → activate → accept HTTP flow, audit
  evidence, no-auto-accept, expired/revoked denials, lifecycle
  non-weakening). Two legacy assertions encoding the superseded
  pending-login policy (`AccessControlHardeningTest::a14`,
  `CoreIdentityAuditTest`) were updated to the new approved
  behavior: pending may authenticate, never silently activates,
  and retains zero operational access.

## Known limitation (documented, unchanged)

A pending user who logs in reaches the SPA shell, but every
operational API still returns 403 until activation; the invitation
and verification pages are the intended pending-state surface.
