<?php

namespace App\Core\Security\Mfa;

use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Administrative MFA lifecycle service (C7-A). Supports TOTP factor
 * enrollment, activation, verification, recovery codes, and step-up
 * challenge issuance. All TOTP secrets are encrypted at rest; recovery
 * codes are bcrypt-hashed; secrets never appear in API responses or logs.
 */
final class MfaService
{
    public const RECOVERY_CODE_COUNT = 8;

    public const CHALLENGE_TTL_SECONDS = 300;

    public const CHALLENGE_MAX_ATTEMPTS = 5;

    public const FACTOR_MAX_FAILED_ATTEMPTS = 10;

    public const FACTOR_LOCK_SECONDS = 900;

    public function __construct(
        private readonly SecurityEventWriter $events,
        private readonly Encrypter $encrypter,
    ) {}

    // ---------------- Enrollment ----------------

    /**
     * Begin TOTP enrollment for $user. Returns the provisioning URI and
     * a short-lived nonce that must be confirmed before activation.
     *
     * @return array{factor_id:int, provisioning_uri:string, nonce:string}
     */
    public function beginEnrollment(User $user, Request $request): array
    {
        if ($this->hasActiveFactor($user)) {
            throw new RuntimeException('An active MFA factor already exists; disable it before enrolling a new one.');
        }

        return DB::transaction(function () use ($user, $request): array {
            // Cancel any pending factors
            DB::table('security_mfa_factors')
                ->where('user_id', $user->id)
                ->where('status', MfaFactorStatus::PENDING->value)
                ->update(['status' => MfaFactorStatus::DISABLED->value]);

            $secret = TotpEngine::generateSecret();
            $nonce = Str::random(32);
            $factorId = DB::table('security_mfa_factors')->insertGetId([
                'user_id' => $user->id,
                'type' => MfaFactorType::TOTP->value,
                'secret_encrypted' => $this->encrypter->encryptString($secret),
                'status' => MfaFactorStatus::PENDING->value,
                'recovery_nonce' => hash('sha256', $nonce),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->events->record(
                'mfa.enrollment.initiated',
                SecurityEventOutcome::SUCCESS,
                $user, $user->id, 'mfa_factor', $factorId,
                metadata: ['type' => MfaFactorType::TOTP->value],
                request: $request,
            );

            return [
                'factor_id' => (int) $factorId,
                'provisioning_uri' => TotpEngine::provisioningUri($secret, $user->email ?? $user->username ?? 'user'),
                'nonce' => $nonce,
            ];
        });
    }

    /**
     * Confirm a pending factor by verifying a TOTP code; after success,
     * fresh recovery codes are generated and returned (plaintext,
     * displayed only once).
     *
     * @param  array<int, string>  $totpCode
     * @return array{recovery_codes: array<int, string>}
     */
    public function confirmAndActivate(User $user, int $factorId, string $nonce, string $totpCode, Request $request): array
    {
        return DB::transaction(function () use ($user, $factorId, $nonce, $totpCode, $request): array {
            $factor = DB::table('security_mfa_factors')
                ->where('id', $factorId)->where('user_id', $user->id)
                ->lockForUpdate()->first();
            if (! $factor || $factor->status !== MfaFactorStatus::PENDING->value) {
                throw new RuntimeException('No pending MFA factor to activate.');
            }
            if (! $factor->recovery_nonce || ! hash_equals($factor->recovery_nonce, hash('sha256', $nonce))) {
                throw new RuntimeException('Invalid enrollment nonce.');
            }
            $secret = $this->encrypter->decryptString($factor->secret_encrypted);
            if (! TotpEngine::verify($secret, $totpCode)) {
                $this->events->record('mfa.enrollment.confirm_failed', SecurityEventOutcome::FAILURE,
                    $user, $user->id, 'mfa_factor', $factorId, request: $request);
                throw new RuntimeException('Invalid TOTP code.');
            }
            // Generate recovery codes.
            $codes = [];
            $codeRecords = [];
            for ($i = 0; $i < self::RECOVERY_CODE_COUNT; $i++) {
                $plain = Str::random(10);
                $codes[] = $plain;
                $codeRecords[] = [
                    'user_id' => $user->id,
                    'code_hash' => Hash::make($plain),
                    'created_at' => now(),
                ];
            }
            DB::table('security_mfa_recovery_codes')->where('user_id', $user->id)->delete();
            DB::table('security_mfa_recovery_codes')->insert($codeRecords);

            DB::table('security_mfa_factors')->where('id', $factor->id)->update([
                'status' => MfaFactorStatus::ACTIVE->value,
                'recovery_nonce' => null,
                'activated_at' => now(),
                'failed_attempts' => 0,
                'updated_at' => now(),
            ]);

            $this->events->record('mfa.enrollment.activated', SecurityEventOutcome::SUCCESS,
                $user, $user->id, 'mfa_factor', (int) $factor->id,
                metadata: ['recovery_codes_generated' => count($codes)],
                request: $request);

            return ['recovery_codes' => $codes];
        });
    }

    public function hasActiveFactor(User $user): bool
    {
        return DB::table('security_mfa_factors')
            ->where('user_id', $user->id)
            ->where('status', MfaFactorStatus::ACTIVE->value)
            ->exists();
    }

    public function activeFactor(User $user): ?object
    {
        return DB::table('security_mfa_factors')
            ->where('user_id', $user->id)
            ->where('status', MfaFactorStatus::ACTIVE->value)
            ->first();
    }

    // ---------------- Challenges ----------------

    /**
     * Issue an MFA challenge. Returns a challenge_token the client must
     * present back when verifying.
     *
     * @return array{challenge_token: string, expires_at: CarbonImmutable}
     */
    public function issueChallenge(User $user, string $purpose, Request $request, ?string $sessionId = null): array
    {
        if (! $this->hasActiveFactor($user)) {
            throw new RuntimeException('MFA enrollment required.');
        }
        $factor = $this->activeFactor($user);
        $token = Str::random(40);
        $expiresAt = CarbonImmutable::now()->addSeconds(self::CHALLENGE_TTL_SECONDS);

        DB::table('security_mfa_challenges')->insert([
            'user_id' => $user->id,
            'factor_id' => $factor->id,
            'purpose' => $purpose,
            'challenge_token_hash' => hash('sha256', $token),
            'attempts' => 0,
            'expires_at' => $expiresAt,
            'request_ip' => $request->ip(),
            'request_correlation' => $request->header('X-Correlation-Id'),
            'session_id' => $sessionId,
            'created_at' => now(),
        ]);

        return ['challenge_token' => $token, 'expires_at' => $expiresAt];
    }

    /**
     * Verify TOTP against an active factor and an issued challenge.
     * Consumes the challenge atomically.
     */
    public function verifyTotpChallenge(User $user, string $challengeToken, string $code, Request $request): bool
    {
        $throttleKey = 'mfa:verify:'.$user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, 20)) {
            $this->events->record('mfa.challenge.rate_limited', SecurityEventOutcome::RATE_LIMITED,
                $user, $user->id, request: $request);

            return false;
        }

        return DB::transaction(function () use ($user, $challengeToken, $code, $request, $throttleKey): bool {
            $challenge = DB::table('security_mfa_challenges')
                ->where('challenge_token_hash', hash('sha256', $challengeToken))
                ->where('user_id', $user->id)
                ->whereNull('verified_at')
                ->lockForUpdate()
                ->first();
            if (! $challenge || CarbonImmutable::now()->gt(CarbonImmutable::parse($challenge->expires_at))) {
                RateLimiter::hit($throttleKey, 300);
                $this->events->record('mfa.challenge.invalid', SecurityEventOutcome::FAILURE,
                    $user, $user->id, request: $request);

                return false;
            }
            if ((int) $challenge->attempts >= self::CHALLENGE_MAX_ATTEMPTS) {
                RateLimiter::hit($throttleKey, 300);
                $this->events->record('mfa.challenge.attempts_exhausted', SecurityEventOutcome::BLOCKED,
                    $user, $user->id, request: $request);

                return false;
            }
            $factor = DB::table('security_mfa_factors')
                ->where('id', $challenge->factor_id)->lockForUpdate()->first();
            if (! $factor || $factor->status !== MfaFactorStatus::ACTIVE->value) {
                return false;
            }
            if ($factor->locked_until && CarbonImmutable::now()->lt(CarbonImmutable::parse($factor->locked_until))) {
                $this->events->record('mfa.factor.locked', SecurityEventOutcome::BLOCKED,
                    $user, $user->id, 'mfa_factor', (int) $factor->id, request: $request);

                return false;
            }
            $secret = $this->encrypter->decryptString($factor->secret_encrypted);
            $ok = TotpEngine::verify($secret, $code);

            if (! $ok) {
                DB::table('security_mfa_challenges')->where('id', $challenge->id)->increment('attempts');
                $newAttempts = (int) $challenge->attempts + 1;
                if ($newAttempts >= self::CHALLENGE_MAX_ATTEMPTS) {
                    $factorAttempts = (int) $factor->failed_attempts + 1;
                    $lockUntil = null;
                    if ($factorAttempts >= self::FACTOR_MAX_FAILED_ATTEMPTS) {
                        $lockUntil = now()->addSeconds(self::FACTOR_LOCK_SECONDS);
                    }
                    DB::table('security_mfa_factors')->where('id', $factor->id)->update([
                        'failed_attempts' => $factorAttempts,
                        'locked_until' => $lockUntil,
                        'updated_at' => now(),
                    ]);
                }
                RateLimiter::hit($throttleKey, 300);
                $this->events->record('mfa.challenge.invalid_code', SecurityEventOutcome::FAILURE,
                    $user, $user->id, 'mfa_factor', (int) $factor->id, request: $request);

                return false;
            }

            DB::table('security_mfa_challenges')->where('id', $challenge->id)->update([
                'verified_at' => now(),
            ]);
            DB::table('security_mfa_factors')->where('id', $factor->id)->update([
                'last_used_at' => now(),
                'failed_attempts' => 0,
                'locked_until' => null,
                'updated_at' => now(),
            ]);
            RateLimiter::clear($throttleKey);
            $this->events->record('mfa.challenge.verified', SecurityEventOutcome::SUCCESS,
                $user, $user->id, 'mfa_factor', (int) $factor->id,
                metadata: ['purpose' => $challenge->purpose],
                request: $request);

            return true;
        });
    }

    /**
     * Consume a single-use recovery code and return true on success.
     */
    public function useRecoveryCode(User $user, string $code, Request $request): bool
    {
        $throttleKey = 'mfa:recovery:'.$user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, 10)) {
            $this->events->record('mfa.recovery.rate_limited', SecurityEventOutcome::RATE_LIMITED,
                $user, $user->id, request: $request);

            return false;
        }

        return DB::transaction(function () use ($user, $code, $request, $throttleKey): bool {
            $rows = DB::table('security_mfa_recovery_codes')
                ->where('user_id', $user->id)->whereNull('used_at')
                ->lockForUpdate()->get();
            $factor = $this->activeFactor($user);
            foreach ($rows as $row) {
                if (Hash::check($code, $row->code_hash)) {
                    DB::table('security_mfa_recovery_codes')->where('id', $row->id)->update([
                        'used_at' => now(),
                        'used_by_factor_id' => $factor?->id,
                    ]);
                    RateLimiter::clear($throttleKey);
                    $this->events->record('mfa.recovery.used', SecurityEventOutcome::SUCCESS,
                        $user, $user->id, 'mfa_factor', $factor?->id, request: $request);

                    return true;
                }
            }
            RateLimiter::hit($throttleKey, 300);
            $this->events->record('mfa.recovery.invalid', SecurityEventOutcome::FAILURE,
                $user, $user->id, request: $request);

            return false;
        });
    }

    /**
     * Disable MFA (privileged/self-service). Generates a new set of
     * recovery codes if a new factor is subsequently enrolled.
     */
    public function disable(User $user, Request $request): void
    {
        DB::transaction(function () use ($user, $request): void {
            DB::table('security_mfa_factors')
                ->where('user_id', $user->id)
                ->update(['status' => MfaFactorStatus::DISABLED->value, 'updated_at' => now()]);
            DB::table('security_mfa_recovery_codes')
                ->where('user_id', $user->id)->delete();
            DB::table('security_mfa_challenges')
                ->where('user_id', $user->id)->whereNull('verified_at')
                ->delete();
            $this->events->record('mfa.factor.disabled', SecurityEventOutcome::SUCCESS,
                $user, $user->id, request: $request);
        });
    }
}
