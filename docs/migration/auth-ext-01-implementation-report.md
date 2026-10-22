# AUTH-EXT-01 — Implementation Report (Registration, Authentication & Account Security)

**Status:** Implemented on `arena/582a70e5-main-tadbir` — **awaiting human acceptance**. Not merged; PR #14 remains open.
**Decisions:** ADR-0021 (AMB-01=B, AMB-02..06=A). Spec: `docs/architecture/spec-auth-ext-01-registration-authentication-account-security.md`.

## 1. Honest status taxonomy

| Dimension | Status |
|---|---|
| Code Complete | **YES** (backend M1–M4 + frontend 17 screens; see §3 traceability) |
| Security Verified | **NO** — independent security scan remains an OPEN merge prerequisite (as before). GitGuardian check now neutral; no credentials committed. |
| Dev-CI Ready | **YES** — all five quality gates green at `9c914cc0` and on the final restore commit; `quality.yml` byte-identical to canonical (md5 `26d1e92032611a4547bd7d3f1088d94f`). |
| Production Ready | **NO** — operator dependencies outstanding (§4) and PR unmerged. |

## 2. What was built

### Backend (Laravel, additive migration `2026_10_19_000002_auth_ext_01_identity.php`)
- **Identity schema:** `users.username_normalized` (+ backfill hook), `phone_verified_at`, `personal_workspace_provisioned_at`, `welcomed_at`, `reauthenticated_at`, `deletion_requested_at`; tables `auth_otp_challenges` (hashed codes), `auth_password_reset_tokens` (hashed, single-use — created because an existing contract test pins the absence of the framework `password_reset_tokens` table), `verified_phone_claims` (atomic claim), `user_devices` (hashed device cookies), `user_external_identities`, `user_terms_acceptances`.
- **AMB-01=B usernames:** `UsernamePolicy` (format, normalization, reserved/confusable rejection, Persian messages); normalization-equivalent uniqueness via `username_normalized`; login accepts username **or verified email only** (unverified contact is never identity proof); legacy raw-username login fallback preserved for pre-normalization accounts. Registration records versioned terms evidence (`terms_version` must match `auth.terms.current_version`); canonical Persian password-rule messages restored verbatim.
- **AMB-03=A OTP:** provider-neutral `SmsOtpDelivery`; drivers: `UnavailableSmsOtpDelivery` (default, fail-safe localized `delivery_unavailable`), `FakeSmsOtpDelivery` (tests only). Codes hashed, TTL 120s, 5 attempts, resend cooldown, per-number/per-IP caps; challenge responses enumeration-resistant; login + mobile-change verification; verified-phone claim is DB-atomic (`OtpClaimConflict` fail-closed).
- **Recovery:** forgot/reset via hashed single-use tokens (60 min), delivered by mail to the verified address only; reset deletes all sessions + Sanctum tokens; uniform responses.
- **Google OIDC:** manual flow (PKCE S256 + state + nonce), `id_token` verified via Google `tokeninfo` + aud/iss/exp checks; config-gated (`google_unavailable` when unconfigured); **no silent account merge** — linking requires authenticated + reauthenticated session.
- **AMB-04=A step-up:** opaque `tadbir_device` cookie (SHA-256 hash stored, risk signal only); step-up required for unknown device after 30 days inactivity; sensitive account mutations require `reauthenticated_at` < 10 min.
- **Provisioning (AMB-02=A):** `AccountActivationService` — pending→active on email confirm, idempotent personal workspace (`PersonalWorkspaceProvisioner::ensureDefault`) + Personal Free via C5 `SubscriptionService::assignInitial` with correlation `auth-activation-{userId}`; attaches **only** when `auth.personal_free_plan_key` is configured/published, otherwise records a `pending_plan` dependency — never faked.
- **AMB-05=A deletion:** 14-day grace; restricted login during grace (403 `deletion_pending`); cancellation does **not** restore revoked sessions; shared-workspace-ownership guard on request; `accounts:process-deletions` anonymizes personal fields to terminal status `deactivated` (users.status enum), never deletes shared/org records.
- **Console:** `auth:phone-preflight`, `auth:username-preflight` (read-only, AMB-06=A), `auth:prune-otp-challenges`, `accounts:process-deletions`.

### Frontend (Persian RTL, flat Ocean per ADR-0020, public pages outside authenticated sidebars)
Routes: `/register`, `/login` (nav to register / mobile OTP / Google / forgot), `/login/mobile`, `/forgot-password`, `/reset-password`, `/verify-email/confirm`, `/auth/step-up`, `/welcome`, `/account/security` (discoverable via ProfileDock «حساب و امنیت»). Gate: `frontend/tests/authext.test.mjs`. Evidence: `docs/evidence/auth-ext-01/*.png` (390/834/1440).

## 3. Traceability (decision → UI → API → schema → tests)

| Decision / Req | UI | API | Schema | Tests |
|---|---|---|---|---|
| AMB-01=B username | RegisterPage (policy hints) | `auth/register`, `findByLogin` | `username_normalized` | `AuthExtTest::test_username_normalization_conflict_and_reserved_are_rejected` |
| Terms evidence | RegisterPage checkbox v1.0 | `RegisterRequest` (version match) | `user_terms_acceptances` | `test_terms_acceptance_is_required_and_recorded` + updated existing register tests |
| Verified-email login | Login (identifier) | `AuthController::findByLogin` | `email_verified_at` | `test_only_verified_email_can_be_a_login_identifier` |
| AMB-03=A OTP | MobileOtpPage (countdown) | `auth/otp/{challenge,login}` | `auth_otp_challenges` | `test_otp_login_lifecycle_and_replay_protection` |
| AMB-06=A phone claim | SecurityPage mobile section | `account/security/mobile[/confirm]` | `verified_phone_claims` | `test_verified_phone_claim_is_exclusive` |
| Recovery | Forgot/Reset pages | `auth/password/{forgot,reset}` | `auth_password_reset_tokens` | `test_password_recovery_token_is_single_use` (uniform response asserted) |
| AMB-02=A provisioning | WelcomePage checklist | email confirm → activation | `personal_workspace_provisioned_at` | `test_activation_provisions_one_personal_workspace_idempotently` |
| AMB-04=A step-up/sessions | StepUpPage, SecurityPage sessions | `auth/step-up`, `account/sessions*` | `user_devices`, `reauthenticated_at` | `test_session_revocation_requires_reauth_and_deletion_grace` |
| AMB-05=A deletion | SecurityPage deletion (Persian pending date) | `account/deletion-request[/cancel]`, `deletion-status` | `deletion_requested_at` | same test + `accounts:process-deletions` anonymize assertion |

Full suite in CI: 898 backend tests (AuthExtTest 8 tests included), 277 frontend tests, Pint clean in scope, migration gates on sqlite/MySQL/MariaDB 10.4 legacy-timestamp mode.

## 4. Open dependencies (reported, never faked)

1. **Personal Free plan (C5):** no published plan exists yet; activation records `pending_plan` dependency until `auth.personal_free_plan_key` is configured. (C5-EXT-01 not started — not authorized.)
2. **SMS gateway (operator):** no production credentials in repo; default driver fails safe with localized `delivery_unavailable`. OTP login is functional only where an operator configures a real driver.
3. **Google OAuth client (operator):** unconfigured → `google_unavailable`; no fake success path.
4. **Independent security scan + ARCH-02 acceptance:** still OPEN merge prerequisites for PR #14.

## 5. Contract changes to existing tests (sanctioned, assertions preserved)

- Register payload now requires `terms_accepted` + `terms_version`: updated builders in `UsernameAccountsTest`, `InvitationOnboardingActivationTest`, `DepartmentConsolidationTest` (payload-only; assertions unchanged).
- Canonical Persian password-rule messages restored verbatim in `RegisterRequest` (frontend regression gate pins them).
- Reset tokens use `auth_password_reset_tokens` to respect the existing "no framework reset table" contract test.

## 6. Verification evidence

- CI: PR/push runs green at `9c914cc0`; final commit re-verified after workflow restore (see stage-status entry).
- Local: frontend `npm test` 277/277, `tsc --noEmit` clean, production build succeeds.
- Screenshots: `docs/evidence/auth-ext-01/` — register (390/1440), OTP login (390), forgot (834), step-up (390), account security (390/1440), welcome (834). Mocked-API captures (sandbox has no PHP runtime); runtime behavior itself is covered by backend Feature tests in CI.
