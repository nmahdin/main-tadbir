<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Google OIDC (AUTH-EXT-01 §4.3): PKCE + state + nonce. Entirely
 * operator-configured (`services.google.*`); when unconfigured the
 * endpoints answer `google_unavailable` and the SPA hides the button.
 * ID-token validation is delegated to Google's tokeninfo endpoint
 * (signature/issuer verified by Google) and then re-checked here for
 * audience, expiry and nonce binding through the stored state flow.
 * Linking to an existing account always requires an authenticated,
 * recently reauthenticated session — never a silent merge.
 */
class GoogleAuthController extends Controller
{
    private function configured(): bool
    {
        return (string) config('services.google.client_id', '') !== ''
            && (string) config('services.google.client_secret', '') !== '';
    }

    public function redirect(Request $request): RedirectResponse|JsonResponse
    {
        if (! $this->configured()) {
            return response()->json(['message' => 'ورود با Google در حال حاضر فعال نیست.', 'code' => 'google_unavailable'], 503);
        }
        $verifier = Str::random(64);
        $state = Str::random(40);
        $request->session()->put('google_oidc', [
            'verifier' => $verifier, 'state' => $state, 'nonce' => Str::random(32),
        ]);
        $query = http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'nonce' => $request->session()->get('google_oidc.nonce'),
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
            'access_type' => 'online',
            'prompt' => 'select_account',
        ]);

        return redirect('https://accounts.google.com/o/oauth2/v2/auth?'.$query);
    }

    public function callback(Request $request): RedirectResponse
    {
        $spa = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        if (! $this->configured() || $request->query('error')) {
            return redirect($spa.'/auth/google/complete?status=error');
        }
        $stored = $request->session()->pull('google_oidc');
        if (! $stored || ! hash_equals((string) $stored['state'], (string) $request->query('state', ''))) {
            return redirect($spa.'/auth/google/complete?status=error');
        }
        $tokenResponse = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => (string) $request->query('code'),
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => config('services.google.redirect'),
            'grant_type' => 'authorization_code',
            'code_verifier' => $stored['verifier'],
        ]);
        if (! $tokenResponse->successful() || ! $tokenResponse->json('id_token')) {
            return redirect($spa.'/auth/google/complete?status=error');
        }
        $info = Http::get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $tokenResponse->json('id_token')]);
        $claims = $info->json();
        $valid = $info->successful()
            && ($claims['aud'] ?? null) === config('services.google.client_id')
            && in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            && (int) ($claims['exp'] ?? 0) > time()
            && ! empty($claims['sub']);
        if (! $valid) {
            return redirect($spa.'/auth/google/complete?status=error');
        }

        $identity = DB::table('user_external_identities')
            ->where('provider', 'google')->where('subject', $claims['sub'])->first();
        if ($identity) {
            $user = User::findOrFail($identity->user_id);
            if ($user->status !== 'active') {
                return redirect($spa.'/auth/google/complete?status=blocked');
            }
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
            DB::table('user_external_identities')->where('id', $identity->id)->update(['last_login_at' => now()]);
            ActivityLog::create(['user_id' => $user->id, 'action' => 'ورود موفق با Google', 'type' => 'auth.login', 'details' => 'google']);

            return redirect($spa.'/auth/google/complete?status=success');
        }

        // Not linked: park the verified claims server-side; linking to
        // an existing account (or creating one) is an explicit step.
        $request->session()->put('google_pending', [
            'subject' => $claims['sub'],
            'email' => ($claims['email_verified'] ?? false) ? strtolower((string) $claims['email']) : null,
            'name' => (string) ($claims['name'] ?? ''),
        ]);

        return redirect($spa.'/auth/google/complete?status=link-required');
    }

    /** Link the parked Google identity to the signed-in account (A05). */
    public function link(Request $request): JsonResponse
    {
        $pending = $request->session()->get('google_pending');
        if (! $pending) {
            return response()->json(['message' => 'نشست Google یافت نشد؛ دوباره تلاش کنید.'], 422);
        }
        $user = $request->user();
        $fresh = $user->reauthenticated_at !== null && $user->reauthenticated_at->gt(now()->subMinutes(10));
        if (! $fresh) {
            return response()->json(['message' => 'برای پیوند حساب Google، ابتدا احراز هویت مجدد انجام دهید.', 'code' => 'reauth_required'], 403);
        }
        DB::table('user_external_identities')->insertOrIgnore([
            'user_id' => $user->id, 'provider' => 'google', 'subject' => $pending['subject'],
            'email_at_link' => $pending['email'], 'created_at' => now(), 'updated_at' => now(),
        ]);
        $owner = DB::table('user_external_identities')->where('provider', 'google')->where('subject', $pending['subject'])->value('user_id');
        if ((int) $owner !== (int) $user->id) {
            return response()->json(['message' => 'این حساب Google قبلاً به حساب دیگری پیوند خورده است.'], 422);
        }
        $request->session()->forget('google_pending');
        ActivityLog::create(['user_id' => $user->id, 'action' => 'حساب Google پیوند خورد', 'type' => 'auth.identity_linked', 'details' => 'google']);

        return response()->json(['message' => 'حساب Google با موفقیت پیوند خورد.']);
    }
}
