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
use Throwable;

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
        // حساب ناشناس یا غیرفعال همان پاسخ عمومی را می‌گیرد تا نام کاربری لو نرود.
        if (! $user?->isActive()) {
            return;
        }
        $link = BaleUserLink::where('user_id', $user->id)->first();
        if (! $link) {
            // حساب متصل نیست: کد به شمارهٔ خودِ کاربر در بله فرستاده می‌شود. اگر
            // بله اجازهٔ پیام به شماره (بدون اتصال) را نداد، کاربر باید بداند که
            // امکان دریافت کد وجود ندارد، نه اینکه منتظر پیامی بماند که نمی‌آید.
            if (! $this->deliverToPhone($user, $purpose)) {
                throw ValidationException::withMessages([
                    'login' => 'امکان ارسال کد یک‌بارمصرف وجود ندارد؛ حساب شما به ربات بله متصل نشده است. برای دریافت کد، ابتدا از بخش تنظیمات حساب، بله را متصل کنید یا با مدیر سیستم تماس بگیرید.',
                ]);
            }

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

    /**
     * تلاش برای تحویل کد به شمارهٔ ثبت‌شدهٔ کاربر در بله.
     *
     * بله مثل پیام‌رسان‌های مشابه، پیام ربات را فقط به «شناسهٔ گفت‌وگو» تحویل
     * می‌دهد؛ شمارهٔ خام تنها زمانی پذیرفته می‌شود که خودِ بله آن را به گفت‌وگو
     * نگاشت کند. پس ارسال واقعاً انجام و نتیجه‌اش بررسی می‌شود: موفق ⇒ `true`،
     * هر خطا یا شمارهٔ نامعتبر ⇒ `false` تا فراخوان پیام روشنِ
     * «امکان ارسال کد وجود ندارد» را برگرداند.
     */
    private function deliverToPhone(User $user, string $purpose): bool
    {
        $phone = $this->normalizedPhone($user->phone ?? null);
        if ($phone === null) {
            return false;
        }

        try {
            $code = (string) random_int(100000, 999999);
            $expires = now()->addMinutes(self::LIFETIME_MINUTES);
            $label = $purpose === self::LOGIN ? 'ورود به سامانه تدبیر' : 'بازیابی رمز عبور سامانه تدبیر';
            $message = DB::transaction(function () use ($user, $phone, $purpose, $code, $expires, $label): BaleOutbox {
                DB::table('bale_auth_challenges')->updateOrInsert(
                    ['user_id' => $user->id, 'purpose' => $purpose],
                    ['code_hash' => $this->hash($user, $purpose, $code), 'attempts' => 0, 'expires_at' => $expires, 'updated_at' => now(), 'created_at' => now()],
                );

                return $this->outbox->enqueue(
                    'auth:'.$purpose.':'.$user->id.':'.$phone.':'.Str::uuid(),
                    $phone,
                    ['text' => "کد یک‌بارمصرف {$label}: {$code}\nاین کد تا ".self::LIFETIME_MINUTES.' دقیقه معتبر است.'],
                    null,
                    'auth_challenge',
                    (int) $user->id,
                );
            });

            app(NotificationDelivery::class)->sendNow([$message->id]);

            // «در صف» یعنی ارسال در تلاش بعدی انجام می‌شود (مثلاً محدودیت نرخ)؛
            // فقط شکست قطعی، پیام «امکان ارسال کد وجود ندارد» را موجه می‌کند.
            $status = (string) $message->refresh()->status;
            if ($status === 'sent' || $status === 'pending' || $status === 'sending' || $status === 'unknown') {
                return true;
            }

            DB::table('bale_auth_challenges')->where('user_id', $user->id)->where('purpose', $purpose)->delete();

            return false;
        } catch (Throwable) {
            DB::table('bale_auth_challenges')->where('user_id', $user->id)->where('purpose', $purpose)->delete();

            return false;
        }
    }

    /** شمارهٔ کاربر به شکل موردقبول بله (ارقام لاتین، بدون + و جداساز). */
    private function normalizedPhone(?string $phone): ?string
    {
        if ($phone === null) {
            return null;
        }
        $digits = preg_replace('/[^0-9]/', '', $phone) ?? '';
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (preg_match('/^09\d{9}$/', $digits)) {
            $digits = '98'.substr($digits, 1);
        }

        return preg_match('/^\d{10,15}$/', $digits) ? $digits : null;
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
            // اتصال به بله شرط ورود نیست: کد می‌تواند از مسیر شمارهٔ کاربر در
            // بله آمده باشد. وجودِ چالش (که فقط پس از ارسال موفق ساخته می‌شود)
            // و اعتبار/انقضای آن، همان تضمین لازم را می‌دهد.
            if (! $user?->isActive()) {
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
