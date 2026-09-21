<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

class AuthController extends Controller
{
    /**
     * حداکثر تلاش ناموفق ورود پیش از قفل موقت.
     */
    private const MAX_LOGIN_ATTEMPTS = 5;

    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();
        $throttleKey = $this->throttleKey($credentials['login'], $request);

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_LOGIN_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($throttleKey);

            throw ValidationException::withMessages([
                'login' => sprintf(
                    'تلاش‌های ناموفق زیاد بوده است. لطفاً %d ثانیه دیگر تلاش کنید.',
                    $seconds,
                ),
            ]);
        }

        $user = $this->findByLogin($credentials['login']);

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            RateLimiter::hit($throttleKey, 60);

            throw ValidationException::withMessages([
                'login' => 'نام کاربری یا رمز عبور نادرست است.',
            ]);
        }

        if ($blockedMessage = $this->blockedMessage($user)) {
            return response()->json(['message' => $blockedMessage], 403);
        }

        RateLimiter::clear($throttleKey);

        $token = $this->establishSession($user, $request);

        $user->forceFill(['last_login_at' => now()])->save();

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'ورود موفق به سامانه تدبیر',
            'type' => 'auth_login',
            'details' => $token ? 'ورود از طریق توکن API' : 'ورود از طریق پنل وب',
        ]);

        return $this->userResponse($user, 'ورود با موفقیت انجام شد.', $token);
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
                'email' => $data['email'],
                'password' => $data['password'],
                'phone' => $data['phone'] ?? null,
                'title' => $data['title'] ?? null,
                'department_id' => $this->resolveDepartmentId($data['department'] ?? null),
                'role_id' => $role?->id,
                'role_key' => $roleKey,
                'status' => $status,
                'two_factor_enabled' => false,
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
        $token = $autoLogin ? $this->establishSession($user, $request) : null;

        $message = $status === 'pending'
            ? 'ثبت‌نام شما انجام شد و پس از تأیید مدیر سیستم فعال می‌شود.'
            : 'ثبت‌نام با موفقیت انجام شد.';

        return $this->userResponse($user, $message, $token, 201);
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

        if ($user && $token = $user->currentAccessToken()) {
            $token->delete();
        }

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'خروج از حساب کاربری انجام شد.',
        ]);
    }

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        Password::sendResetLink($request->only('email'));

        // برای جلوگیری از افشای وجود یا نبود حساب، پاسخ همیشه یکسان است.
        return response()->json([
            'message' => 'اگر این ایمیل در سامانه ثبت شده باشد، لینک بازیابی رمز عبور ارسال می‌شود.',
        ]);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset(
            $request->validated(),
            function (User $user, string $password): void {
                $user->forceFill(['password' => $password])->save();
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => 'کد بازیابی نامعتبر یا منقضی شده است.',
            ]);
        }

        return response()->json([
            'message' => 'رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید وارد شوید.',
        ]);
    }

    /**
     * یافتن کاربر با نام کاربری، ایمیل یا شماره تماس.
     */
    private function findByLogin(string $login): ?User
    {
        $field = filter_var($login, FILTER_VALIDATE_EMAIL)
            ? 'email'
            : (preg_match('/^0?9\d{9}$/', $login) ? 'phone' : 'username');

        return User::query()
            ->with(['role.permissions', 'department'])
            ->where($field, $login)
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
            default => null,
        };
    }

    /**
     * ورود کاربر بر پایه نوع درخواست: نشست برای SPA و توکن برای سایر کلاینت‌ها.
     */
    private function establishSession(User $user, Request $request): ?string
    {
        if (EnsureFrontendRequestsAreStateful::fromFrontend($request)) {
            Auth::guard('web')->login($user, (bool) $request->boolean('remember'));

            if ($request->hasSession()) {
                $request->session()->regenerate();
            }

            return null;
        }

        return $user->createToken($request->userAgent() ?? 'api-token')->plainTextToken;
    }

    private function resolveDepartmentId(?string $department): ?int
    {
        if (! $department) {
            return null;
        }

        $value = trim($department);

        return Department::query()
            ->where('slug', $value)
            ->orWhere('name', $value)
            ->value('id');
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

        return $resource->response()->setStatusCode($status);
    }
}
