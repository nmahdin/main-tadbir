<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Core\Identity\EmailVerificationService;
use App\Core\Identity\Otp\OtpChallengeService;
use App\Core\Invitations\InvitationToken;
use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Core\Identity\EmailVerificationChallenge;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * AUTH-EXT-01 account security (A02–A05, A07, A08). Every mutation is
 * self-scoped to the authenticated user; sensitive mutations require
 * a fresh reauthentication (`reauthenticated_at` within 10 minutes).
 */
class AccountSecurityController extends Controller
{
    private function requireReauth(Request $request): void
    {
        $user = $request->user();
        $fresh = $user->reauthenticated_at !== null && $user->reauthenticated_at->gt(now()->subMinutes(10));
        if (! $fresh) {
            throw ValidationException::withMessages([
                'reauth' => 'برای این کار، ابتدا دوباره وارد حساب خود شوید (احراز هویت مجدد لازم است).',
            ]);
        }
    }

    private function audit(User $user, string $type, string $action, string $details = ''): void
    {
        ActivityLog::create(['user_id' => $user->id, 'action' => $action, 'type' => $type, 'details' => $details]);
    }

    /** A05: step-up by password (or fresh login challenge response). */
    public function reauthenticate(Request $request): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();
        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => 'رمز عبور نادرست است.']);
        }
        $user->forceFill(['reauthenticated_at' => now()])->save();
        $this->audit($user, 'auth.reauthenticated', 'احراز هویت مجدد انجام شد');

        return response()->json(['message' => 'هویت شما دوباره تأیید شد.']);
    }

    /** A08: password change with reauth + optional session invalidation. */
    public function changePassword(Request $request): JsonResponse
    {
        $this->requireReauth($request);
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'invalidate_others' => ['sometimes', 'boolean'],
        ]);
        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'رمز عبور فعلی نادرست است.']);
        }
        $user->forceFill(['password' => Hash::make($data['password'])])->save();
        if ($data['invalidate_others'] ?? true) {
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', $request->hasSession() ? $request->session()->getId() : '')->delete();
        }
        $this->audit($user, 'auth.password_changed', 'رمز عبور تغییر کرد');

        return response()->json(['message' => 'رمز عبور شما به‌روزرسانی شد.']);
    }

    /** A02: request email change (verify new, notify old after success). */
    public function requestEmailChange(Request $request, EmailVerificationService $service): JsonResponse
    {
        $this->requireReauth($request);
        $data = $request->validate(['email' => ['required', 'email', 'max:320']]);
        $user = $request->user();
        $email = strtolower(trim($data['email']));
        if (User::where('email', $email)->where('id', '!=', $user->id)->exists()) {
            throw ValidationException::withMessages(['email' => 'این ایمیل قبلاً استفاده شده است.']);
        }
        $service->requestChallenge($user, $email);
        $this->audit($user, 'auth.email_change_requested', 'درخواست تغییر ایمیل ثبت شد');

        return response()->json(['message' => 'کد تأیید به ایمیل تازه ارسال شد.']);
    }

    public function confirmEmailChange(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:200']]);
        $user = $request->user();
        $challenge = EmailVerificationChallenge::query()
            ->where('token_hash', InvitationToken::hash($data['token']))
            ->where('user_id', $user->id)
            ->whereNull('consumed_at')
            ->first();
        if (! $challenge || $challenge->expires_at <= now()) {
            return response()->json(['message' => 'کد تأیید نامعتبر یا منقضی شده است.'], 422);
        }
        $old = $user->email;
        DB::transaction(function () use ($user, $challenge): void {
            $challenge->forceFill(['consumed_at' => now()])->save();
            $user->forceFill(['email' => $challenge->email_normalized, 'email_verified_at' => now()])->save();
        });
        $this->audit($user, 'auth.email_changed', 'ایمیل ورود تغییر کرد', 'previous_notified='.($old ? 'yes' : 'no'));
        if ($old) {
            // A02: security notification to the PREVIOUS address.
            Mail::raw(
                'ایمیل ورود حساب تدبیر شما تغییر کرد. اگر این کار را شما انجام نداده‌اید، فوراً با پشتیبانی تماس بگیرید.',
                fn ($message) => $message->to($old)->subject('هشدار امنیتی تدبیر: تغییر ایمیل ورود'),
            );
        }

        return response()->json(['message' => 'ایمیل شما به‌روزرسانی و تأیید شد.']);
    }

    /** A03: mobile change via OTP on the new number. */
    public function requestMobileChange(Request $request, OtpChallengeService $otp): JsonResponse
    {
        $this->requireReauth($request);
        $data = $request->validate(['phone' => ['required', 'string', 'max:20']]);
        $result = $otp->challenge($data['phone'], 'mobile_change', (string) $request->ip(), $request->user()->id);
        if (! $result['sent']) {
            return response()->json(['message' => 'در حال حاضر ارسال پیامک ممکن نیست؛ چند دقیقه دیگر تلاش کنید.', 'code' => $result['reason']], 429);
        }

        return response()->json(['message' => 'کد تأیید به شمارهٔ تازه ارسال شد.']);
    }

    public function confirmMobileChange(Request $request, OtpChallengeService $otp): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:20'], 'code' => ['required', 'string', 'size:6']]);
        $user = $request->user();
        try {
            $result = $otp->verify($data['phone'], 'mobile_change', $data['code'], $user, claimPhone: true);
        } catch (\Throwable) {
            return response()->json(['message' => 'این شماره قبلاً به حساب دیگری تعلق دارد.'], 422);
        }
        if (! $result['ok']) {
            return response()->json(['message' => 'کد تأیید نادرست یا منقضی شده است.'], 422);
        }
        $this->audit($user, 'auth.mobile_changed', 'شماره موبایل تغییر کرد و تأیید شد');

        return response()->json(['message' => 'شماره موبایل شما به‌روزرسانی شد.']);
    }

    /** A04: sessions/devices listing + revocation. */
    public function sessions(Request $request): JsonResponse
    {
        $user = $request->user();
        $web = DB::table('sessions')->where('user_id', $user->id)
            ->orderByDesc('last_activity')
            ->get(['id', 'ip_address', 'user_agent', 'last_activity'])
            ->map(fn ($s) => [
                'id' => 'web:'.$s->id, 'kind' => 'web', 'ip' => $s->ip_address,
                'device' => $s->user_agent, 'current' => $request->hasSession() && $s->id === $request->session()->getId(),
                'last_active_at' => date('c', (int) $s->last_activity),
            ]);
        $tokens = $user->tokens()->orderByDesc('last_used_at')->get()
            ->map(fn ($t) => [
                'id' => 'token:'.$t->id, 'kind' => 'token', 'ip' => null,
                'device' => $t->device_label ?: $t->name, 'current' => false,
                'last_active_at' => optional($t->last_used_at)->toIso8601String(),
            ]);

        return response()->json(['data' => [...$web, ...$tokens]]);
    }

    public function revokeSession(Request $request, string $id): JsonResponse
    {
        $this->requireReauth($request);
        $user = $request->user();
        [$kind, $raw] = array_pad(explode(':', $id, 2), 2, '');
        if ($kind === 'web') {
            DB::table('sessions')->where('user_id', $user->id)->where('id', $raw)->delete();
        } elseif ($kind === 'token') {
            $user->tokens()->where('id', $raw)->delete();
        } else {
            return response()->json(['message' => 'نشست یافت نشد.'], 404);
        }
        $this->audit($user, 'auth.sessions_revoked', 'یک نشست پایان یافت', $kind);

        return response()->json(['message' => 'نشست پایان یافت.']);
    }

    public function revokeOtherSessions(Request $request): JsonResponse
    {
        $this->requireReauth($request);
        $user = $request->user();
        $user->tokens()->delete();
        DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', $request->hasSession() ? $request->session()->getId() : '')->delete();
        $this->audit($user, 'auth.sessions_revoked', 'همهٔ نشست‌های دیگر پایان یافت');

        return response()->json(['message' => 'همهٔ نشست‌های دیگر پایان یافت.']);
    }

    /** A07: deletion request + cancellation (14-day grace). */
    public function requestDeletion(Request $request, AccountLifecycle $lifecycle): JsonResponse
    {
        $this->requireReauth($request);
        $data = $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();
        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => 'رمز عبور نادرست است.']);
        }
        // Ownership guard: never orphan shared organizational records.
        $ownsShared = DB::table('workspaces')
            ->where('owner_user_id', $user->id)
            ->whereExists(fn ($q) => $q->select(DB::raw(1))->from('workspace_memberships')
                ->whereColumn('workspace_memberships.workspace_id', 'workspaces.id')
                ->where('workspace_memberships.user_id', '!=', $user->id))
            ->exists();
        if ($ownsShared) {
            return response()->json(['message' => 'شما مالک فضای کاری مشترکی هستید؛ ابتدا مالکیت را منتقل یا فضا را منحل کنید.', 'code' => 'shared_ownership'], 422);
        }
        $user->forceFill(['deletion_requested_at' => now()])->save();
        $user->tokens()->delete();
        $this->audit($user, 'auth.deletion_requested', 'درخواست حذف حساب ثبت شد', 'grace_days=14');

        return response()->json(['data' => ['deletion_effective_at' => now()->addDays(14)->toIso8601String()]]);
    }

    public function cancelDeletion(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->forceFill(['deletion_requested_at' => null, 'reauthenticated_at' => now()])->save();
        $this->audit($user, 'auth.deletion_cancelled', 'درخواست حذف حساب لغو شد');

        return response()->json(['message' => 'درخواست حذف حساب لغو شد؛ خوش برگشتید.']);
    }

    public function deletionStatus(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'pending' => $user->deletion_requested_at !== null,
            'effective_at' => $user->deletion_requested_at?->copy()->addDays(14)->toIso8601String(),
        ]]);
    }

    /** Welcome state (§4.8). */
    public function welcome(Request $request): JsonResponse
    {
        $user = $request->user();
        $invitations = $user->email
            ? DB::table('core_invitations')
                ->where('email_normalized', strtolower($user->email))
                ->where('status', 'pending')
                ->count()
            : 0;

        return response()->json(['data' => [
            'welcomed' => $user->welcomed_at !== null,
            'provisioned' => $user->personal_workspace_provisioned_at !== null,
            'pending_invitations' => $invitations,
        ]]);
    }

    public function completeWelcome(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->forceFill(['welcomed_at' => $user->welcomed_at ?? now()])->save();

        return response()->json(['message' => 'خوش آمدید!']);
    }
}
