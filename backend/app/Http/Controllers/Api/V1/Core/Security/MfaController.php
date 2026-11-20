<?php

namespace App\Http\Controllers\Api\V1\Core\Security;

use App\Core\Security\Mfa\MfaService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Consumer self-service MFA management (C7-A). Enrollment, activation,
 * disable, and challenge verification. The frontend-facing endpoints
 * are under /me/security/mfa.
 */
final class MfaController extends Controller
{
    public function __construct(
        private readonly MfaService $mfa,
    ) {}

    public function status(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => [
                'enrolled' => $this->mfa->hasActiveFactor($user),
                'recovery_codes_remaining' => $this->mfa->hasActiveFactor($user)
                    ? (int) DB::table('security_mfa_recovery_codes')
                        ->where('user_id', $user->id)->whereNull('used_at')->count()
                    : 0,
            ],
        ]);
    }

    public function beginEnrollment(Request $request): JsonResponse
    {
        try {
            $result = $this->mfa->beginEnrollment($request->user(), $request);

            return response()->json([
                'data' => [
                    'factor_id' => $result['factor_id'],
                    'provisioning_uri' => $result['provisioning_uri'],
                    // Secret is intentionally NOT returned; only the
                    // otpauth URI (suitable for QR rendering) is
                    // exposed, and only before activation.
                    'nonce' => $result['nonce'],
                    'expires_in_seconds' => MfaService::CHALLENGE_TTL_SECONDS,
                ],
            ], 201);
        } catch (RuntimeException $e) {
            return response()->json(['error' => ['code' => 'mfa_invalid_state', 'message' => $e->getMessage()]], 409);
        }
    }

    public function confirmEnrollment(Request $request, int $factorId): JsonResponse
    {
        $validated = $request->validate([
            'nonce' => ['required', 'string', 'size:32'],
            'code' => ['required', 'string', 'regex:/^\d{6}$/'],
        ]);
        try {
            $result = $this->mfa->confirmAndActivate(
                $request->user(),
                $factorId,
                $validated['nonce'],
                $validated['code'],
                $request,
            );

            return response()->json([
                'data' => [
                    'activated' => true,
                    'recovery_codes' => $result['recovery_codes'],
                ],
            ]);
        } catch (RuntimeException $e) {
            return response()->json(['error' => ['code' => 'mfa_confirm_failed', 'message' => $e->getMessage()]], 400);
        }
    }

    public function disable(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required_without:recovery_code', 'string', 'regex:/^\d{6}$/'],
            'recovery_code' => ['required_without:code', 'string'],
            'challenge_token' => ['required', 'string'],
        ]);
        $user = $request->user();
        // Verify the challenge before disabling.
        if (! empty($validated['code'])) {
            $ok = $this->mfa->verifyTotpChallenge($user, $validated['challenge_token'], $validated['code'], $request);
        } else {
            $ok = $this->mfa->useRecoveryCode($user, $validated['recovery_code'], $request);
        }
        if (! $ok) {
            return response()->json(['error' => ['code' => 'mfa_verification_failed']], 403);
        }
        $this->mfa->disable($user, $request);

        return response()->json(['data' => ['disabled' => true]]);
    }
}
