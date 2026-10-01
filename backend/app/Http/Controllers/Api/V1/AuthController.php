<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use App\Services\BaleAuthChallenge;
use App\Services\BalePanelSession;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    /**
     * حداکثر تلاش ناموفق ورود پیش از قفل موقت.
     */
    private const MAX_LOGIN_ATTEMPTS = 5;

    /**
     * ورود پنل وب فقط با نشست امن سمت سرور انجام می‌شود.
     *
     * این مسیر عمداً token برنمی‌گرداند. middleware وب، نشست را آغاز می‌کند و
     * Laravel کوکی نشست/remember را در پاسخ Set-Cookie قرار می‌دهد.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $user = $this->authenticate($request);

        if (! $request->hasSession()) {
            return response()->json([
                'message' => 'نشست امن ورود در سرور فعال نیست. تنظیمات session را بررسی کنید.',
                'code' => 'session_unavailable',
            ], 503);
        }

        Auth::guard('web')->login($user, $request->boolean('remember'));
        $request->session()->regenerate();

        $this->recordSuccessfulLogin($user, 'ورود از طریق نشست امن پنل وب');

        return $this->userResponse($user, 'ورود با موفقیت انجام شد.');
    }

    /** Send a short-lived code to the private Bale chat already linked to this account. */
    public function baleCode(Request $request, BaleAuthChallenge $challenges): JsonResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'purpose' => ['required', 'in:login,password_reset'],
        ]);
        $challenges->issue($data['login'], $data['purpose'], (string) $request->ip());

        // The same response prevents username/link-status enumeration.
        return response()->json([
            'message' => 'اگر حساب فعال و به بله متصل باشد، کد یک‌بارمصرف ارسال شد.',
            'expires_in' => BaleAuthChallenge::LIFETIME_MINUTES * 60,
        ], 202)->header('Cache-Control', 'no-store, private');
    }

    public function baleLogin(Request $request, BaleAuthChallenge $challenges): JsonResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'regex:/^\\d{6}$/'],
            'remember' => ['sometimes', 'boolean'],
        ]);
        $user = $challenges->verify($data['login'], BaleAuthChallenge::LOGIN, $data['code'], (string) $request->ip());
        if (! $request->hasSession()) {
            return response()->json(['message' => 'نشست امن ورود در سرور فعال نیست.', 'code' => 'session_unavailable'], 503);
        }
        Auth::guard('web')->login($user, $request->boolean('remember'));
        $request->session()->regenerate();
        $this->recordSuccessfulLogin($user, 'ورود با کد یک‌بارمصرف ربات بله');

        return $this->userResponse($user, 'ورود امن با ربات بله انجام شد.');
    }

    public function balePanelLogin(Request $request, BalePanelSession $sessions): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D'],
        ]);
        if (! $request->hasSession()) {
            return response()->json(['message' => 'نشست امن ورود در سرور فعال نیست.', 'code' => 'session_unavailable'], 503);
        }

        $user = $sessions->consume($data['token']);
        Auth::guard('web')->login($user, false);
        $request->session()->regenerate();
        $this->recordSuccessfulLogin($user, 'ورود مستقیم از مینی‌اپ ربات بله');

        return $this->userResponse($user, 'ورود مستقیم از ربات بله انجام شد.')
            ->header('Cache-Control', 'no-store, private');
    }

    public function baleResetPassword(Request $request, BaleAuthChallenge $challenges): JsonResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'regex:/^\\d{6}$/'],
            'password' => ['required', 'string', 'min:8', 'max:128', 'confirmed'],
        ], [
            'login.required' => 'نام کاربری یا شماره تماس را وارد کنید.',
            'code.required' => 'کد تأیید را وارد کنید.',
            'code.regex' => 'کد تأیید باید دقیقاً ۶ رقم باشد.',
            'password.required' => 'رمز عبور جدید را وارد کنید.',
            'password.min' => 'رمز عبور جدید باید حداقل ۸ نویسه باشد.',
            'password.max' => 'رمز عبور جدید نمی‌تواند بیشتر از ۱۲۸ نویسه باشد.',
            'password.confirmed' => 'رمز عبور و تکرار آن یکسان نیستند.',
        ]);
        $user = $challenges->verify($data['login'], BaleAuthChallenge::PASSWORD_RESET, $data['code'], (string) $request->ip());
        DB::transaction(function () use ($user, $data): void {
            $user->forceFill(['password' => $data['password'], 'remember_token' => Str::random(60)])->save();
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            ActivityLog::create([
                'user_id' => $user->id,
                'action' => 'بازیابی امن رمز عبور',
                'type' => 'auth_password_reset',
                'details' => 'رمز عبور با کد یک‌بارمصرف ربات بله تغییر کرد.',
            ]);
        });

        return response()->json(['message' => 'رمز عبور تغییر کرد؛ اکنون با رمز جدید وارد شوید.'])
            ->header('Cache-Control', 'no-store, private');
    }

    /**
     * صدور token فقط برای کلاینت‌های غیرمرورگری؛ پنل وب از این مسیر استفاده نمی‌کند.
     */
    public function token(LoginRequest $request): JsonResponse
    {
        $user = $this->authenticate($request);
        $token = $user->createToken($request->userAgent() ?? 'api-token')->plainTextToken;

        $this->recordSuccessfulLogin($user, 'ورود از طریق توکن API');

        return $this->userResponse($user, 'توکن ورود با موفقیت صادر شد.', $token);
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        $status = (string) config('auth.registration.status', 'active');
        $roleKey = (string) config('auth.registration.role', 'team_member');
        $role = Role::query()->where('key', $roleKey)->first();

        $user = DB::transaction(function () use ($data, $status, $role, $roleKey): User {
            return User::create([
                'name' => $data['name'],
                'username' => $data['username'],
                'password' => $data['password'],
                'phone' => $data['phone'] ?? null,
                'title' => $data['title'] ?? null,
                'department_id' => null,
                'role_id' => $role?->id,
                'role_key' => $roleKey,
                'status' => $status,
            ]);
        });

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => sprintf('ثبت‌نام کاربر «%s» در سامانه', $user->name),
            'type' => 'user_created',
            'details' => $status === 'pending'
                ? 'حساب در انتظار تأیید مدیر سیستم است.'
                : 'حساب کاربری فعال شد.',
        ]);

        $autoLogin = (bool) config('auth.registration.auto_login', false) && $status === 'active';
        if ($autoLogin) {
            if (! $request->hasSession()) {
                return response()->json([
                    'message' => 'حساب ساخته شد، اما نشست امن ورود در سرور فعال نیست.',
                    'code' => 'session_unavailable',
                ], 503);
            }

            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        $message = $status === 'pending'
            ? 'ثبت‌نام شما انجام شد و پس از تأیید مدیر سیستم فعال می‌شود.'
            : 'ثبت‌نام با موفقیت انجام شد.';

        return $this->userResponse($user, $message, status: 201);
    }

    public function me(Request $request): JsonResponse
    {
        return $this->userResponse(
            $request->user(),
            null,
        );
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        $token = $user?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'خروج از حساب کاربری انجام شد.',
        ])->header('Cache-Control', 'no-store, private');
    }

    /**
     * اعتبارسنجی مشترک credential برای ورود نشستی و صدور token.
     */
    private function authenticate(LoginRequest $request): User
    {
        $credentials = $request->validated();
        $throttleKey = $this->throttleKey($credentials['login'], $request);

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_LOGIN_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($throttleKey);

            throw new HttpResponseException(
                response()->json([
                    'message' => sprintf('تلاش‌های ناموفق زیاد بوده است. لطفاً %d ثانیه دیگر تلاش کنید.', $seconds),
                ], 429)->header('Retry-After', (string) $seconds),
            );
        }

        $user = $this->findByLogin($credentials['login']);

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            RateLimiter::hit($throttleKey, 60);

            throw ValidationException::withMessages([
                'login' => 'نام کاربری یا رمز عبور نادرست است.',
            ]);
        }

        if ($blockedMessage = $this->blockedMessage($user)) {
            throw new HttpResponseException(
                response()->json(['message' => $blockedMessage], 403),
            );
        }

        RateLimiter::clear($throttleKey);

        return $user;
    }

    private function recordSuccessfulLogin(User $user, string $details): void
    {
        $user->forceFill(['last_login_at' => now()])->save();

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'ورود موفق به سامانه تدبیر',
            'type' => 'auth_login',
            'details' => $details,
        ]);
    }

    private function findByLogin(string $login): ?User
    {
        // ورود به سامانه صرفاً با نام کاربری انجام می‌شود.
        return User::query()
            ->with(['role.permissions', 'department'])
            ->where('username', $login)
            ->first();
    }

    private function throttleKey(string $login, Request $request): string
    {
        return Str::transliterate(Str::lower($login).'|'.$request->ip());
    }

    /**
     * پیام مناسب برای حساب‌هایی که اجازه ورود ندارند.
     */
    private function blockedMessage(User $user): ?string
    {
        return match ($user->status) {
            'blocked' => 'حساب کاربری شما مسدود شده است. با مدیر سیستم تماس بگیرید.',
            'inactive' => 'حساب کاربری شما غیرفعال است. با مدیر سیستم تماس بگیرید.',
            'active' => null,
            default => 'حساب کاربری شما هنوز اجازه ورود ندارد؛ با مدیر سیستم تماس بگیرید.',
        };
    }

    private function userResponse(
        User $user,
        ?string $message = null,
        ?string $token = null,
        int $status = 200,
    ): JsonResponse {
        $user->loadMissing(['role.permissions', 'department']);

        $resource = (new UserResource($user))->additional(array_filter([
            'message' => $message,
            'token' => $token,
        ]));

        return $resource->response()
            ->setStatusCode($status)
            ->header('Cache-Control', 'no-store, private');
    }
}
