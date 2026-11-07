<?php

namespace App\Core\Identity;

use App\Core\Audit\AuditWriter;
use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\EmailNormalizer;
use App\Core\Invitations\InvitationException;
use App\Core\Invitations\InvitationToken;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Verified email identity (Stage C6-2).
 *
 * Username authentication is untouched: this service layers a
 * verified email address on the authenticated account for the
 * sole purpose (today) of invitation acceptance.
 *
 * Rules:
 *  - An address is claimed via requestChallenge(): the address is
 *    normalized (EmailNormalizer), must not belong to another
 *    account (unique users.email + explicit check ->
 *    email_already_claimed), replaces any pending address, and
 *    CLEARS any prior verification (email_verified_at = null)
 *    until the new address is proven. Outstanding unconsumed
 *    challenges for the account are invalidated atomically.
 *  - Challenges are single-use, expire after 30 minutes, store
 *    only the token hash, and are consumed atomically inside the
 *    confirmation transaction (the row is locked; a challenge can
 *    verify an account at most once — concurrent confirmations
 *    serialize on the row).
 *  - confirmEmail() verifies only when the challenge belongs to
 *    the user, is unconsumed and unexpired (at expires_at the
 *    challenge is already dead), and the account's current
 *    claimed address still equals the challenged address (an
 *    address change after issuance makes old challenges useless:
 *    email_verification_invalid).
 *  - Nothing auto-verifies: not a submitted address, not an
 *    invitation link, not a profile edit. The only write to
 *    email_verified_at in the system happens in confirmEmail().
 *  - C6 amendment: confirmEmail() also activates a PENDING account
 *    when (and only when) the newly verified address matches a live
 *    pending invitation — invitation onboarding without manual
 *    administrator activation. The invitation is never accepted by
 *    verification; acceptance remains a separate explicit act, and
 *    no non-pending status is ever modified by this service.
 *  - Delivery goes through EmailVerificationDelivery; the default
 *    binding fails closed (email_delivery_unavailable) until a
 *    real transport is configured (C6-3/C6-4). Raw tokens never
 *    appear in the database, audit summaries, or logs.
 *
 * Emails are normalized with the same normalizer used for
 * invitations, so acceptance compares like with like.
 */
final class EmailVerificationService
{
    public const CHALLENGE_LIFETIME_MINUTES = 30;

    public function __construct(
        private readonly EmailVerificationDelivery $delivery,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * Claim an address and issue a verification challenge.
     *
     * @throws EmailVerificationException|InvitationException (email normalization)
     */
    public function requestChallenge(User $user, string $email): IssuedEmailChallenge
    {
        $normalized = EmailNormalizer::normalize($email);
        $expiresAt = CarbonImmutable::now('UTC')->addMinutes(self::CHALLENGE_LIFETIME_MINUTES);
        $rawToken = InvitationToken::generate();

        DB::transaction(function () use ($user, $normalized, $rawToken, $expiresAt): void {
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            $claimedByOther = User::query()
                ->where('email', $normalized)
                ->whereKeyNot($locked->id)
                ->exists();

            if ($claimedByOther) {
                throw new EmailVerificationException('email_already_claimed', 'This email address is already associated with another account.');
            }

            // A new (or changed) claim invalidates every earlier
            // challenge and any prior verification.
            EmailVerificationChallenge::query()
                ->where('user_id', $locked->id)
                ->whereNull('consumed_at')
                ->update(['consumed_at' => CarbonImmutable::now('UTC')]);

            $locked->forceFill([
                'email' => $normalized,
                'email_verified_at' => null,
            ])->save();

            EmailVerificationChallenge::create([
                'user_id' => $locked->id,
                'email_normalized' => $normalized,
                'token_hash' => InvitationToken::hash($rawToken),
                'expires_at' => $expiresAt,
            ]);

            $this->audit->record($locked, 'identity.email_verification_requested', [
                'user_id' => (int) $locked->id,
            ], 'user', (int) $locked->id, 'user', (int) $locked->id);
        });

        // Delivery is the only external side effect; if it fails,
        // the challenge stands but the caller is told delivery is
        // unavailable (fail-closed). The token is NOT recoverable —
        // the user simply requests a new challenge.
        $fresh = $user->fresh();
        $this->delivery->deliver($fresh, $normalized, $rawToken, $expiresAt);

        return new IssuedEmailChallenge($fresh, $normalized, $rawToken, $expiresAt);
    }

    /**
     * Confirm a challenge and mark the address verified.
     *
     * @throws EmailVerificationException
     */
    public function confirmEmail(User $user, string $rawToken): User
    {
        return DB::transaction(function () use ($user, $rawToken): User {
            $challenge = EmailVerificationChallenge::query()
                ->where('token_hash', InvitationToken::hash($rawToken))
                ->lockForUpdate()
                ->first();

            if ($challenge === null || (int) $challenge->user_id !== (int) $user->id || $challenge->consumed_at !== null) {
                throw new EmailVerificationException('email_verification_invalid', 'The verification code is invalid.');
            }

            $now = CarbonImmutable::now('UTC');

            if (! CarbonImmutable::instance($challenge->expires_at)->gt($now)) {
                throw new EmailVerificationException('email_verification_expired', 'The verification code has expired; request a new one.');
            }

            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($locked->email === null || $locked->email !== $challenge->email_normalized) {
                throw new EmailVerificationException('email_verification_invalid', 'The verification code no longer matches the account email address.');
            }

            $challenge->forceFill(['consumed_at' => $now])->save();

            $locked->forceFill(['email_verified_at' => $now])->save();

            $this->audit->record($locked, 'identity.email_verified', [
                'user_id' => (int) $locked->id,
            ], 'user', (int) $locked->id, 'user', (int) $locked->id);

            // C6 policy amendment (invitation onboarding): a PENDING
            // account becomes active — eligible for invitation
            // acceptance — when its freshly verified address is the
            // target of a live (pending, unexpired) invitation. This
            // replaces manual administrator activation ONLY on the
            // invitation path: verification alone never activates
            // (a live invitation must match), the invitation itself
            // is NOT accepted here, and no other status is ever
            // changed (suspended / deactivated / blocked / inactive
            // accounts are untouched by this path, so lifecycle
            // controls are never weakened by it).
            if ($locked->status === AccountStatus::Pending->value) {
                $invitation = CoreInvitation::query()
                    ->where('email_normalized', $locked->email)
                    ->where('status', CoreInvitation::STATUS_PENDING)
                    ->where('expires_at', '>', $now)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->first();

                if ($invitation !== null) {
                    $locked->forceFill(['status' => AccountStatus::Active->value])->save();

                    $this->audit->record($locked, 'identity.account_activated_via_invitation', [
                        'user_id' => (int) $locked->id,
                        'invitation_id' => (int) $invitation->id,
                    ], 'user', (int) $locked->id, 'user', (int) $locked->id);
                }
            }

            return $locked;
        });
    }

    /**
     * The account's verified normalized email, or null when the
     * account has no verified address. Acceptance compares this
     * against the invitation's normalized destination.
     */
    public function verifiedEmail(User $user): ?string
    {
        $fresh = $user->fresh();

        if ($fresh === null || $fresh->email === null || $fresh->email_verified_at === null) {
            return null;
        }

        return $fresh->email;
    }
}
