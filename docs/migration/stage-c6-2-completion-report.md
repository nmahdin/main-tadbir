# Stage C6-2 — Verified Email Identity & Atomic Invitation Acceptance — Completion Report

Status: COMPLETE at code + CI level (pending human acceptance).
Branch: `arena/582a70e5-main-tadbir` (PR #14, open, unmerged).
Start HEAD: `7d70e68` (C6-1 final). Implementation head: `692be77` (CI
SUCCESS on push + PR checks; this report commit follows).
Date: 2026-10-17.

Code Complete: YES / Security Verified (within tested boundaries): YES
/ Dev-CI Ready: YES / Production Operationally Ready: NO (email
delivery not wired — see §7; Bootstrap/Recovery unchanged).

## 1. Verified-email foundation (§2 of the stage)

Migration `2026_10_15_000014_add_verified_email_identity.php`:

- `users.email` — nullable, unique (MySQL unique index; multiple NULLs
  allowed). Stores the NORMALIZED address only (trim + lowercase via
  the C6-1 `EmailNormalizer`). Deliberately NOT in the User model's
  `$fillable`, and `email`/`email_verified_at` are hidden from
  serialization — no API response exposes them (legacy serialization
  assertions retained and passing).
- `users.email_verified_at` — nullable UTC timestamp; set ONLY when a
  challenge is proven for the CURRENT stored address.
- `core_email_verification_challenges` — `user_id` (FK RESTRICT),
  `email_normalized`, `token_hash` char(64) SHA-256 UNIQUE,
  `expires_at`, `consumed_at`; index on (user_id, consumed_at).

`App\Core\Identity\EmailVerificationService`:

- `requestChallenge($user, $email)` — rejects non-active accounts
  (`email_verification_not_eligible`), rejects an address already
  verified by ANOTHER account (`email_already_claimed`), invalidates
  the user's outstanding challenges, stores only the SHA-256 hash,
  audits `identity.email_verification_requested` (no address, no token
  in the summary), and hands the raw token to the delivery port.
- Challenges: 256-bit CSPRNG token (reuses `InvitationToken`), 30-minute
  TTL, single-use. `confirmEmail($user, $email, $rawToken)` consumes
  atomically under a user-row lock: exactly one unconsumed, unexpired
  challenge may match (hash + address + account); consumption and the
  `email`/`email_verified_at` write happen in the same transaction,
  with audit `identity.email_verified`. Unknown / consumed / mismatched
  / expired all fail `email_verification_invalid` (expired:
  `email_verification_expired`); the exact expiry instant is expired.
- Changing to a different address clears `email_verified_at` and
  invalidates outstanding challenges — prior verification never
  survives an address change. Re-requesting a challenge for an already
  verified address keeps the verified state until a new address is
  proven.
- NO auto-verification from any submitted address, invitation link, or
  editable profile field; username login untouched (proven by test).

## 2. Delivery port & the remaining blocker (§2/§7)

`EmailVerificationDelivery` is the single delivery port. The default
container binding is `UnavailableEmailVerificationDelivery`, which
throws `email_delivery_unavailable` — **fail-closed**: with no real
transport configured, no challenge leaves the process and no account
can become email-verified in production. This is the documented
unresolved blocker: **C6-3/C6-4 must wire a real transport** (or an
operations-approved delivery channel) to this port before verified
email — and therefore invitation acceptance — can be used by real
users. Tests bind a capturing double at the port and exercise the
genuine service flow ("never inject arbitrary verified identities into
production paths" honored: tests prove verification only through the
real challenge flow).

Verification tokens are never exposed via any public unauthenticated
API (no such endpoint exists in this stage); the raw token exists only
inside the delivery call.

## 3. Atomic acceptance service (§3–§4)

`App\Core\Invitations\InvitationAcceptanceService::accept($acceptor,
$rawToken)` — one transaction, lock order: **invitation row →
organization row → workspace row → membership rows** (consistent with
C3/C6-1; scope-container rows before membership/role locks):

1. Acceptor from the trusted auth context (service argument; never
   client-supplied IDs — the method takes only the token).
2. Token resolved by SHA-256 hash; row locked `FOR UPDATE`.
3. Pending state rechecked under lock; exact expiry boundary enforced
   (`invitation_expired` at equality); terminal states fail closed
   (`invitation_revoked` for every non-pending state).
4. The acceptor's VERIFIED normalized email must equal the invitation
   target (`invitation_email_mismatch` otherwise; unverified accounts
   fail the same way — invitation links and logins never verify).
5. Persisted scope ownership revalidated: organization invitations
   target the invitation's organization; workspace/combined invitations
   re-derive the organization from the persisted workspace (combined:
   stored organization == persisted workspace owner, else
   `invitation_invalid`).
6. Organization lifecycle revalidated under lock: suspended → denied
   for every type; ended → denied (`invitation_organization_unavailable`).
7. Inviter authority revalidated from PERSISTED assignments: active
   account + active org membership (org/combined) + active workspace
   membership (workspace/combined) + `*.members.manage` in the CURRENT
   effective permission set; the invitation's stored role is re-checked
   against the inviter's CURRENT independent Grant Ceilings per scope
   (`invitation_grant_ceiling` on drift; `invitation_inviter_authority_lost`
   otherwise). Role assignment then uses the provisioner-established
   system path (`assignSystemRole`) inside the same lock scope — no
   `roles.manage` requirement is introduced for acceptance.
8. Membership effects are additive only:
   - organization invitation → organization membership only;
   - workspace invitation → workspace membership only, requiring an
     existing active org membership (`invitation_prerequisite_missing`);
   - combined → exactly the missing org + target-workspace memberships;
     never any other workspace;
   - an existing ACTIVE org membership keeps its role untouched
     (PRESERVED — never replaced or elevated);
   - active workspace membership with a DIFFERENT role, or any
     deactivated membership → `invitation_membership_conflict`;
     an ended membership is safely recreated.
9. `invitation.accepted` audit (actor = acceptor) + token consumption
   (`accepted_by_user_id`, `accepted_at`) in the SAME transaction —
   any failure (incl. audit write failure, proven by test) rolls back
   memberships, roles, audit and consumption. Viewing, lookup,
   authentication alone, and registration never consume.
10. Returns `InvitationAcceptanceResult` (invitation, organization,
    workspace, org/workspace membership ids, navigation target
    organization_id/workspace_id, and which memberships were created)
    so C6-3/C6-4 can route the user to the intended scope.

Personal-workspace handling is unchanged; a workspace invitation to a
personal workspace still requires the owner's active personal
organization membership (created only by the existing provisioner).

## 4. Concurrency evidence (§5, real MySQL 8 / InnoDB)

`InvitationAcceptanceConcurrencyMysqlTest` (wired into the permanent
MySQL CI step): bounded waits (5 s), loser maps to the documented
deterministic error, committed postconditions asserted:

- Two simultaneous acceptances: exactly one consumption, exactly one
  org + one workspace membership, one audit row; loser rolls back.
- Revocation vs acceptance under the same row lock: revocation wins,
  no memberships created, invitation stays revoked.
- Organization suspension vs acceptance: suspension commits first,
  acceptance fails `invitation_organization_unavailable`, no membership
  rows, invitation remains pending.
- DB uniqueness (`core_invitations.token_hash`,
  generated-column live-membership uniqueness) remains the final
  duplicate safeguard (unchanged from C6-1).

## 5. Tests

SQLite: `VerifiedEmailTest` (username auth preserved; hashed challenge
storage + no auto-verification + no default verification; atomic
consumption, reuse/wrong-account rejection; exact expiry boundary;
email-change invalidation; duplicate claim; fail-closed default
delivery), `InvitationAcceptanceTest` (organization-only; workspace
prerequisite; combined new member; combined existing member with org
role preservation; email mismatch; unverified; unknown/revoked/expired
incl. exact boundary; inviter authority loss; workspace ceiling drift;
suspended organization; workspace role conflict; personal workspace;
audit-failure rollback). Legacy `UsernameAccountsTest` /
`InitialSeedTest` updated minimally to the new approved contract
(email column exists nullable+unverified, hidden from serialization,
never set by registration/seeds/profile updates; username-only login
and removed password-reset surface unchanged). Full C1–C6-1 regression
suite green. Frontend unchanged; frontend gates green.

## 6. Scope discipline

Not built (later stages): invitation management/preview/acceptance
HTTP APIs (C6-3), React pages (C6-4), any real email transport,
notification/mass-email engine, auto-acceptance after login,
public unauthenticated token endpoints. No new permission keys.
PR #14 remains OPEN and unmerged; `main` untouched; no production
changes.
