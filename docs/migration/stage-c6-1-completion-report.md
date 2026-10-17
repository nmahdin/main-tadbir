# Stage C6-1 Completion Report — Invitation Persistence, Secure Tokens, Expiration, Revocation & Role Intent (incl. approved C6 design amendment)

## 1. Starting and final HEAD

- Baseline: `37f8f5b` (C5-4 close). Initial C6-1 implementation `451533e` + tests `9edef4f`; the product-owner C6 amendment (three intents, dual role intent, message, public presentation contract, combined) was then applied on top as `b34561b` with fixes; final green HEAD **`c890aa3`** (push run `39043311449` SUCCESS; PR run `39043314523` SUCCESS).
- Note: during this stage the sandbox worktree restored stale (HEAD `b30bfef`); it was realigned with `git reset --hard` to the fetched remote branch before any editing. Final workflow diff vs the C5-4 baseline is only the added MySQL suite filenames — no diagnostic commands remain.
- PR #14 remains OPEN and unmerged; `main` untouched; production untouched.

## 2. Created and modified files

Created:
- `backend/database/migrations/2026_10_15_000013_create_invitations_table.php`
- `backend/app/Core/Invitations/{CoreInvitation,InvitationService,InvitationException,InvitationState,InvitationToken,EmailNormalizer,IssuedInvitation,InvitationPresentation,InvitationPresenter}.php`
- `backend/tests/Feature/Core/{InvitationServiceTest,InvitationSchemaMysqlTest,InvitationConcurrencyMysqlTest}.php`
- `docs/migration/stage-c6-1-completion-report.md` (this file)

Modified: `.github/workflows/quality.yml` (MySQL suite now includes the two invitation suites), `docs/migration/stage-status.md` (C6-1 row). No existing domain code was modified: issuance/revocation reuse `MembershipPermissions`, `GrantCeiling`, `ScopedRole`, `OrganizationProvisioner`-shaped scope containers, `AccountStatus`, and C1 `AuditWriter`.

## 3. Final schema and scope constraints

`core_invitations`: id; `type` organization|workspace|combined; nullable `organization_id`/`workspace_id` (FK RESTRICT); `email_normalized`(320); `token_hash` char(64) UNIQUE; `status` pending|accepted|revoked (default pending, `status_version` starts 1); nullable `intended_organization_role_id`/`intended_workspace_role_id` (FK `core_roles` RESTRICT — dual scope-tied role intent on the invitation row; no separate role-intent table, matching the one-role-per-membership convention); `invited_by_user_id` (FK RESTRICT); nullable `message`(1000); `expires_at`; nullable accepted/revoked metadata; timestamps.

Scope shape is enforced by MySQL CHECK (`core_invitations_scope_chk`): organization = org target + org role only; workspace = workspace target + workspace role only; combined = both targets + both roles. Status CHECK mirrors the three stored states. The identical shape is enforced by the `CoreInvitation` model guard (protects SQLite and direct writes), plus model-level immutability of scope/email/token/role intent/message/expiry. For combined invitations the organization is derived from the **persisted workspace's owner** at issuance (never from client input) and cross-checked under lock. Accepted/revoked metadata columns exist now so C6-2 needs no schema migration.

## 4. Token and expiry security guarantees

- Tokens: 256-bit CSPRNG (`random_bytes(32)`), base64url; only the SHA-256 hash is persisted (`token_hash`, hidden on the model). `IssuedInvitation` is the single boundary where the raw token exists; it is never written to DB, logs, or audit (audit summaries carry ids/type/role ids/expiry only — asserted in tests; C1 masking would also mask any `token`-named key). Lookup is exact indexed equality on the deterministic hash (`resolveByRawToken`); a lookup never consumes or mutates (asserted).
- Expiry: default exactly 7 days; explicit override bounded to (now, now+30 days]. Effective state is evaluated deterministically in UTC (`InvitationState`): pending & now < expires_at → eligible; pending & now ≥ expires_at → effectively Expired (exact-boundary tested, no cron); revoked/accepted are terminal and take precedence over expiry (revocation-after-expiry tested).

## 5. Role intent and Grant Ceiling enforcement

Issuance validates, inside the issuance transaction: inviter account is operationally active; inviter holds `organization.members.manage` in that organization and/or `workspace.members.manage` in that workspace (no new permission keys; MembershipPermissions already requires active memberships — and, for org-owned workspaces, active organization membership + operational organization); intended role(s) exist and belong to the exact scope container (`invitation_role_scope_mismatch` otherwise); each role's permission set fits the inviter's effective keys **in that scope** via C3 `GrantCeiling` (independently per scope for combined; escalation persists nothing — tested); suspended/ended organizations deny issuance and revocation (`invitation_organization_unavailable`, tested for both states and for org-owned workspace scopes). Platform-primary and legacy-admin actors without scope membership are denied (tested). Role intent is immutable after issuance; if the inviter later loses authority or a role drifts, C6-2 acceptance revalidation must fail closed (contract recorded in code docs; acceptance itself not implemented).

## 6. Issuance and revocation behavior

- Issuance creates NO membership, NO role assignment, NO module/subscription change (count-asserted); it persists the invitation + transactional `invitation.issued` audit (audit failure rolls back — tested for issue and revoke).
- Duplicate rule (deterministic, documented): an effective pending invitation for the same intent+scope+email+role intent(s) → `invitation_duplicate_pending`; expired leftovers never block reissue and are never silently revoked.
- Message: optional, trimmed, markup-stripped, ≤1000 chars (`invitation_message_too_long`), immutable.
- Email: trim + lowercase normalization only (no invented mailbox-equivalence rules), validated; invalid → `invitation_email_invalid`. **C6-2 gap (honest):** the current identity system is username-based — no verified user email exists today, so the approved acceptance rule "authenticated user whose verified, normalized email matches" cannot be implemented until C6-2/C6-4 defines the user-email source and its verification; C6-1 stores the normalized destination as the comparison target.
- Revocation: row lock in transaction; accepted → `invitation_already_accepted`, revoked → `invitation_already_revoked`; authority is the invitation's own scope authority (combined: either scope authority suffices — revocation only removes a pending grant); revocation increments `status_version`, records actor/time, audits `invitation.revoked`, and never deletes memberships. Revoking an expired-pending invitation is allowed and stays revoked forever.
- Public presentation: `InvitationPresenter` builds the privacy-bounded DTO (type/effective status/exact expiry/will-create-organization-membership, org name + description/logo **only** from explicit `settings.public`, workspace name, inviter display name, intended role names + human-readable summaries, sanitized message) — no ids, no email, no token/hash, no rosters/settings/audit/authorization internals (test asserts absence + that private settings never surface, and that presenting never consumes). The URL-bearing-token sensitivity (no-referrer/no-store, no analytics) is documented in the DTO contract for C6-3/C6-4.

## 7. Tests and actual results

- `InvitationServiceTest` (SQLite, 13 tests): both single scopes + combined issuance; personal-workspace invitation inventing no org membership; exact 7-day default; exact expiry boundary; override bounds; role invalid/wrong-scope/other-container rejection; clerk Grant-Ceiling escalation denial with zero persistence; cross-workspace denial; org member / platform-primary / legacy-admin / suspended-actor denials; duplicate conflict + different-role allowed + reissue after expiry; revocation contract incl. terminal refusals, outsider denial, expiry precedence; suspended/ended denial of issue+revoke; audit-failure rollback (issue + revoke); email normalization/invalid; intent immutability; combined dual-authority matrix (org-only, ws-only, ceiling-per-scope), combined-on-personal rejection, message limits, presentation-DTO privacy.
- `InvitationSchemaMysqlTest` (MySQL): scope CHECK violations (org+workspace both set, neither set, combined missing a role intent, org intent carrying a workspace role), status CHECK, token-hash uniqueness, restrictive FKs on role and organization.
- `InvitationConcurrencyMysqlTest` (MySQL, bounded `innodb_lock_wait_timeout = 2`): concurrent revocations serialize on the invitation row (loser 1205 → after commit `invitation_already_revoked`, exactly one committed revocation, `status_version` 2); duplicate issuance serializes on the scope-container lock then observes the committed pending row (`invitation_duplicate_pending`, exactly one committed invitation).
- CI full suite (C1–C5 regressions + new suites): push run `39043311449` SUCCESS, PR run `39043314523` SUCCESS (backend SQLite incl. Pint, MySQL migration gate + full MySQL concurrency suite, frontend gates).

## 8. MySQL-specific findings

- CHECK constraints (incl. the amended dual-role shape) enforce what SQLite cannot; the same rules are model-guarded for SQLite. MySQL schema/concurrency suites pass in CI.
- Concurrency proofs use real InnoDB locks with committed-postcondition assertions; SQLite lock behavior is not used as evidence (documented convention).
- CI discipline: the workflow carries **no** temporary diagnostic steps; two short-lived annotation probes (Pint + teamcity) were used and fully reverted (final workflow diff = suite filenames only). One defect class found by tests: positional-argument slip (explicit expiry landed in the new message slot) — fixed in tests; service signature keeps message before expiry for readability, callers in C6-3 should use named arguments.

## 9. CI links

- Push run `39043311449` — SUCCESS (head `c890aa3`).
- PR run `39043314523` — SUCCESS (head `c890aa3`).

## 10. Remaining C6-2 integration requirements

1. **User email source + verification** must be defined (accounts are username-based today): acceptance compares the authenticated user's *verified normalized* email against `email_normalized` using `EmailNormalizer`.
2. Atomic acceptance transaction: authenticate → resolve token (read-only until commit point) → recheck effective state/expiry → revalidate scope ownership (combined: stored organization == persisted workspace owner), inviter authority, and BOTH Grant Ceilings → create missing organization membership (existing membership keeps its current organization role — never replaced/elevated) → create workspace membership with intended workspace role → audit → mark accepted (`accepted_at`, `accepted_by_user_id`, `status_version++`) — all-or-nothing; failure leaves the invitation unconsumed; no duplicate memberships on repeat; redirect to the workspace only after success + normal authorization.
3. C6-3 adds authenticated management APIs + safe preview/accept endpoints using `InvitationPresenter` (with no-referrer/no-store headers); delivery of the raw token to the invitee belongs to C6-3/C6-4 (no email/notification infrastructure exists yet — C10).
4. Documented deferrals carried forward: growth-limit enforcement (C5), `storage_bytes` (C9), Bootstrap/Recovery **NOT PRODUCTION-READY** (unverified hosting cron/PHP-CLI, production MySQL, secret custody, backups).

## 11. PR status

PR #14: **OPEN, unmerged**, head `c890aa3` = local = remote. Not merged to `main`. Production untouched. **Stopped after C6-1** as instructed; C6-2 requires fresh approval.
