<?php

namespace App\Services;

use App\Bot\Bale\Notifications\NotificationDelivery;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Settings;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** One-time authentication codes delivered only to an already linked private Bale chat. */
final class BaleAuthChallenge
{
    public const LOGIN = 'login';

    public const PASSWORD_RESET = 'password_reset';

    public const LIFETIME_MINUTES = 5;

    public function __construct(private Settings $settings, private Outbox $outbox) {}

    /**
     * Deliberately returns the same result for unknown, inactive, unlinked and valid accounts.
     */
    public function issue(string $login, string $purpose, string $ip): void
    {
        $login = Str::lower(trim($login));
        $this->guardPurpose($purpose);
        $rateKey = 'bale-auth:issue:'.hash_hmac('sha256', $login.'|'.$ip, (string) config('app.key'));
        if (RateLimiter::tooManyAttempts($rateKey, 3)) {
            throw ValidationException::withMessages(['login' => 'کمی بعد دوباره برای دریافت کد تلاش کنید.']);
        }
        RateLimiter::hit($rateKey, 600);

        if (! $this->settings->ready()) {
            return;
        }
        $user = User::query()->where('username', $login)->first();
        $link = $user ? BaleUserLink::where('user_id', $user->id)->first() : null;
        if (! $user?->isActive() || ! $link) {
            return;
        }

        $code = (string) random_int(100000, 999999);
        $expires = now()->addMinutes(self::LIFETIME_MINUTES);
        $message = DB::transaction(function () use ($user, $link, $purpose, $code, $expires): BaleOutbox {
            DB::table('bale_auth_challenges')->updateOrInsert(
                ['user_id' => $user->id, 'purpose' => $purpose],
                ['code_hash' => $this->hash($user, $purpose, $code), 'attempts' => 0, 'expires_at' => $expires, 'updated_at' => now(), 'created_at' => now()],
            );
            BaleOutbox::where('subject_type', 'auth_challenge')->where('subject_id', $user->id)->where('status', 'pending')
                ->update(['status' => 'cancelled', 'error_code' => 'superseded']);
            $label = $purpose === self::LOGIN ? 'ورود به سامانه تدبیر' : 'بازیابی رمز عبور سامانه تدبیر';

            return $this->outbox->enqueue(
                'auth:'.$purpose.':'.$user->id.':'.Str::uuid(),
                $link->chat_id,
                ['text' => "کد یک‌بارمصرف {$label}: {$code}\nاین کد تا ".self::LIFETIME_MINUTES.' دقیقه معتبر است. اگر شما درخواست نداده‌اید، این پیام را نادیده بگیرید.'],
                $link,
                'auth_challenge',
                (int) $user->id,
            );
        });

        app(NotificationDelivery::class)->sendNow([$message->id]);
    }

    public function verify(string $login, string $purpose, string $code, string $ip): User
    {
        $login = Str::lower(trim($login));
        $this->guardPurpose($purpose);
        $rateKey = 'bale-auth:verify:'.hash_hmac('sha256', $login.'|'.$ip, (string) config('app.key'));
        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            throw ValidationException::withMessages(['code' => 'تلاش‌های ناموفق زیاد بوده است؛ کمی بعد دوباره تلاش کنید.']);
        }
        RateLimiter::hit($rateKey, 600);

        if (! preg_match('/^\d{6}$/D', $code)) {
            throw $this->invalid();
        }

        $user = DB::transaction(function () use ($login, $purpose, $code): ?User {
            $user = User::query()->where('username', $login)->lockForUpdate()->first();
            if (! $user?->isActive() || ! BaleUserLink::where('user_id', $user->id)->exists()) {
                return null;
            }
            $challenge = DB::table('bale_auth_challenges')->where('user_id', $user->id)->where('purpose', $purpose)->lockForUpdate()->first();
            if (! $challenge || now()->gte($challenge->expires_at) || (int) $challenge->attempts >= 5) {
                if ($challenge) {
                    DB::table('bale_auth_challenges')->where('id', $challenge->id)->delete();
                }

                return null;
            }
            if (! hash_equals((string) $challenge->code_hash, $this->hash($user, $purpose, $code))) {
                DB::table('bale_auth_challenges')->where('id', $challenge->id)->increment('attempts');

                return null;
            }
            DB::table('bale_auth_challenges')->where('id', $challenge->id)->delete();
            BaleOutbox::where('subject_type', 'auth_challenge')->where('subject_id', $user->id)->where('status', 'pending')
                ->update(['status' => 'cancelled', 'error_code' => 'consumed']);

            return $user;
        });

        if (! $user) {
            throw $this->invalid();
        }
        RateLimiter::clear($rateKey);

        return $user->load(['role.permissions', 'department']);
    }

    private function hash(User $user, string $purpose, string $code): string
    {
        return hash_hmac('sha256', $user->id.'|'.$purpose.'|'.$code, (string) config('app.key'));
    }

    private function guardPurpose(string $purpose): void
    {
        if (! in_array($purpose, [self::LOGIN, self::PASSWORD_RESET], true)) {
            throw ValidationException::withMessages(['purpose' => 'نوع درخواست نامعتبر است.']);
        }
    }

    private function invalid(): ValidationException
    {
        return ValidationException::withMessages(['code' => 'کد واردشده نامعتبر یا منقضی شده است.']);
    }
}
