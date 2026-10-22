<?php

namespace App\Core\Identity\Otp;

use App\Core\Identity\PhoneNumber;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * SMS OTP challenges (AUTH-EXT-01 §4.2, A06): 6-digit codes hashed at
 * rest, 120-second expiry, max 5 verify attempts, 60-second resend
 * cooldown, per-number and per-IP caps. Verification consumes the
 * challenge atomically; verified-phone ownership is claimed in the
 * same transaction via verified_phone_claims (AMB-06 — no
 * SELECT-then-UPDATE race).
 */
final class OtpChallengeService
{
    public const CODE_TTL_SECONDS = 120;

    public const MAX_ATTEMPTS = 5;

    public const RESEND_COOLDOWN_SECONDS = 60;

    public const MAX_PER_NUMBER_PER_HOUR = 5;

    public const MAX_PER_IP_PER_DAY = 20;

    public function __construct(private readonly SmsOtpDelivery $delivery) {}

    /**
     * @return array{sent: bool, reason: string|null}
     */
    public function challenge(string $rawPhone, string $purpose, string $ip, ?int $userId = null): array
    {
        $phone = PhoneNumber::normalize($rawPhone);
        if ($phone === null) {
            return ['sent' => false, 'reason' => 'invalid_phone'];
        }
        if (RateLimiter::tooManyAttempts("otp:ip:{$ip}", self::MAX_PER_IP_PER_DAY)) {
            return ['sent' => false, 'reason' => 'rate_limited'];
        }
        $recent = DB::table('auth_otp_challenges')
            ->where('phone', $phone)
            ->where('created_at', '>', now()->subHour())
            ->count();
        if ($recent >= self::MAX_PER_NUMBER_PER_HOUR) {
            return ['sent' => false, 'reason' => 'rate_limited'];
        }
        $latest = DB::table('auth_otp_challenges')
            ->where('phone', $phone)->where('purpose', $purpose)
            ->orderByDesc('id')->first();
        if ($latest && now()->diffInSeconds($latest->created_at, false) > -self::RESEND_COOLDOWN_SECONDS
            && $latest->consumed_at === null && $latest->expires_at > now()) {
            return ['sent' => false, 'reason' => 'cooldown'];
        }

        $code = (string) random_int(100000, 999999);
        if (! $this->delivery->sendOtp($phone, $code, $purpose)) {
            return ['sent' => false, 'reason' => 'delivery_unavailable'];
        }

        DB::table('auth_otp_challenges')->insert([
            'user_id' => $userId,
            'phone' => $phone,
            'purpose' => $purpose,
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => now()->addSeconds(self::CODE_TTL_SECONDS),
            'request_ip' => $ip,
            'created_at' => now(),
        ]);
        RateLimiter::hit("otp:ip:{$ip}", 24 * 3600);

        return ['sent' => true, 'reason' => null];
    }

    /**
     * Verify and consume. When $claimPhone is true (register /
     * mobile_change), the verified number is claimed for $user
     * atomically; a claim owned by another account fails closed.
     *
     * @return array{ok: bool, reason: string|null}
     */
    public function verify(string $rawPhone, string $purpose, string $code, ?User $user = null, bool $claimPhone = false): array
    {
        $phone = PhoneNumber::normalize($rawPhone);
        if ($phone === null) {
            return ['ok' => false, 'reason' => 'invalid_phone'];
        }
        $row = DB::table('auth_otp_challenges')
            ->where('phone', $phone)->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->orderByDesc('id')->first();
        if (! $row || $row->expires_at <= now()) {
            return ['ok' => false, 'reason' => 'expired'];
        }
        if ((int) $row->attempts >= self::MAX_ATTEMPTS) {
            return ['ok' => false, 'reason' => 'attempts_exhausted'];
        }
        if (! Hash::check($code, $row->code_hash)) {
            DB::table('auth_otp_challenges')->where('id', $row->id)->increment('attempts');

            return ['ok' => false, 'reason' => 'invalid_code'];
        }

        return DB::transaction(function () use ($row, $phone, $user, $claimPhone): array {
            $consumed = DB::table('auth_otp_challenges')
                ->where('id', $row->id)->whereNull('consumed_at')
                ->update(['consumed_at' => now()]);
            if ($consumed !== 1) {
                return ['ok' => false, 'reason' => 'already_used'];
            }
            if ($claimPhone && $user !== null) {
                DB::table('verified_phone_claims')->insertOrIgnore([
                    'phone' => $phone, 'user_id' => $user->id, 'claimed_at' => now(),
                ]);
                $owner = DB::table('verified_phone_claims')->where('phone', $phone)->value('user_id');
                if ((int) $owner !== (int) $user->id) {
                    // Another account already owns this verified number:
                    // fail closed, never merge or overwrite (AMB-06).
                    // Re-verifying one's own number stays allowed.
                    throw new OtpClaimConflict('phone_claimed_by_another_account');
                }
                $user->forceFill(['phone' => $phone, 'phone_verified_at' => now()])->save();
            }

            return ['ok' => true, 'reason' => null];
        });
    }
}
