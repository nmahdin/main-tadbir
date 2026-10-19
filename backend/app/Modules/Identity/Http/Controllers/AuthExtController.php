<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Core\Identity\AccountActivationService;
use App\Core\Identity\Devices\DeviceTrust;
use App\Core\Identity\EmailVerificationService;
use App\Core\Identity\Otp\OtpChallengeService;
use App\Core\Identity\PhoneNumber;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * AUTH-EXT-01 public flows that extend (never replace) AuthController:
 * email verification confirm, SMS OTP login, password recovery.
 * Public responses are enumeration-resistant (A06).
 */
class AuthExtController extends Controller
{
    /** Confirm an email-verification token; activates pending accounts. */
    public function confirmEmail(Request $request, EmailVerificationService $service): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer'],
            'token' => ['required', 'string', 'max:200'],
        ]);
        $user = User::find($data['user_id']);
        if (! $user) {
            return response()->json(['message' => 'کد تأیید نامعتبر است.'], 422);
        }
        try {
            $service->confirmEmail($user, $data['token']);
        } catch (\Throwable) {
            return response()->json(['message' => 'کد تأیید نامعتبر یا منقضی شده است؛ کد تازه درخواست کنید.'], 422);
        }
        if ($user->fresh()->status === 'pending') {
            app(AccountActivationService::class)->activate($user->fresh());
        }

        return response()->json(['message' => 'ایمیل شما تأیید شد.']);
    }

    /** AMB-04: complete login step-up (password re-entry), then the client retries login. */
    public function stepUp(Request $request): JsonResponse
    {
        $userId = $request->session()->get('step_up_user_id');
        $data = $request->validate(['password' => ['required', 'string']]);
        $user = $userId ? User::find($userId) : null;
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'رمز عبور نادرست است.'], 422);
        }
        $request->session()->forget('step_up_user_id');
        $request->session()->put('step_up_verified', true);
        $user->forceFill(['reauthenticated_at' => now()])->save();

        return response()->json(['message' => 'هویت شما تأیید شد؛ حالا می‌توانید وارد شوید.']);
    }

    /** Request an SMS OTP for login/registration (uniform response). */
    public function otpChallenge(Request $request, OtpChallengeService $otp): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'purpose' => ['sometimes', 'in:login,register'],
        ]);
        $purpose = $data['purpose'] ?? 'login';
        $user = null;
        if ($purpose === 'login') {
            $phone = PhoneNumber::normalize($data['phone']);
            $user = $phone ? User::where('phone', $phone)->whereNotNull('phone_verified_at')->first() : null;
            if (! $user) {
                // Enumeration resistance: identical outward response,
                // no SMS dispatched for unknown numbers.
                return response()->json(['data' => ['sent' => true, 'expires_in_seconds' => OtpChallengeService::CODE_TTL_SECONDS]]);
            }
        }
        $result = $otp->challenge($data['phone'], $purpose, (string) $request->ip(), $user?->id);
        if (! $result['sent']) {
            $message = $result['reason'] === 'delivery_unavailable'
                ? 'در حال حاضر ارسال پیامک ممکن نیست؛ لطفاً چند دقیقه دیگر دوباره تلاش کنید یا از روش دیگری وارد شوید.'
                : ($result['reason'] === 'invalid_phone' ? 'این شماره موبایل معتبر نیست.' : 'تلاش‌های مجاز تمام شد؛ چند دقیقه دیگر دوباره تلاش کنید.');

            return response()->json(['message' => $message, 'code' => $result['reason']], $result['reason'] === 'invalid_phone' ? 422 : 429);
        }

        return response()->json(['data' => ['sent' => true, 'expires_in_seconds' => OtpChallengeService::CODE_TTL_SECONDS]]);
    }

    /** Verify an OTP and sign in (login purpose). */
    public function otpLogin(Request $request, OtpChallengeService $otp, DeviceTrust $devices): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'code' => ['required', 'string', 'size:6'],
        ]);
        $phone = PhoneNumber::normalize($data['phone']);
        $user = $phone ? User::where('phone', $phone)->whereNotNull('phone_verified_at')->first() : null;
        if (! $user) {
            throw ValidationException::withMessages(['code' => 'کد تأیید نادرست است.']);
        }
        $result = $otp->verify($data['phone'], 'login', $data['code'], $user);
        if (! $result['ok']) {
            $message = $result['reason'] === 'expired'
                ? 'کد تأیید منقضی شده است؛ کد تازه درخواست کنید.'
                : 'کد تأیید نادرست است.';
            throw ValidationException::withMessages(['code' => $message]);
        }
        if ($user->status !== 'active') {
            return response()->json(['message' => 'حساب شما فعال نیست.'], 403);
        }
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $devices->remember($user);
        $user->forceFill(['last_login_at' => now()])->save();
        ActivityLog::create(['user_id' => $user->id, 'action' => 'ورود موفق با کد یکبارمصرف پیامکی', 'type' => 'auth.login', 'details' => 'otp']);

        return response()->json(['data' => ['id' => (string) $user->id, 'welcomed' => $user->welcomed_at !== null]]);
    }

    /** A01: request a password-recovery link (uniform response). */
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email', 'max:320']]);
        $email = strtolower(trim((string) $request->input('email')));
        $user = User::where('email', $email)->whereNotNull('email_verified_at')->first();
        if ($user) {
            $token = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $email],
                ['token' => Hash::make($token), 'created_at' => now()],
            );
            // Delivered through the mail channel by the identity mailer;
            // the raw link is only ever sent to the verified address.
            $user->sendPasswordResetNotification($token);
            ActivityLog::create(['user_id' => $user->id, 'action' => 'درخواست بازیابی رمز عبور', 'type' => 'auth.password_reset_requested', 'details' => 'email']);
        }

        return response()->json(['message' => 'اگر حسابی با این ایمیل وجود داشته باشد، پیوند بازیابی ارسال شد.']);
    }

    /** A01: consume a recovery token (single-use), set a new password. */
    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:320'],
            'token' => ['required', 'string', 'max:200'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);
        $email = strtolower(trim($data['email']));
        $row = DB::table('password_reset_tokens')->where('email', $email)->first();
        $expired = ! $row || now()->diffInMinutes($row->created_at) > 60;
        if ($expired || ! Hash::check($data['token'], $row->token)) {
            return response()->json(['message' => 'پیوند بازیابی نامعتبر یا منقضی شده است.'], 422);
        }
        $user = User::where('email', $email)->firstOrFail();
        DB::transaction(function () use ($user, $data, $email): void {
            $user->forceFill(['password' => Hash::make($data['password'])])->save();
            DB::table('password_reset_tokens')->where('email', $email)->delete();
            // A01/A08: recovery invalidates every other session/token.
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
        });
        ActivityLog::create(['user_id' => $user->id, 'action' => 'رمز عبور با پیوند بازیابی تغییر کرد', 'type' => 'auth.password_reset', 'details' => 'sessions_invalidated']);

        return response()->json(['message' => 'رمز عبور شما به‌روزرسانی شد؛ با رمز تازه وارد شوید.']);
    }
}
