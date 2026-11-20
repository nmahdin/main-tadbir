<?php

namespace App\Http\Controllers\Api\V1\Core\Security;

use App\Core\Security\Mfa\MfaService;
use App\Core\Security\Sessions\StepUpService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * MFA challenge issuance and verification for login step-up (C7-B).
 * Clients POST to /me/security/mfa/challenge with a purpose
 * (login, step_up, recovery), then POST /me/security/mfa/verify with
 * the challenge_token and code.
 */
final class MfaChallengeController extends Controller
{
    public function __construct(
        private readonly MfaService $mfa,
        private readonly StepUpService $stepUp,
    ) {}

    public function issue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purpose' => ['required', 'string', 'in:login,step_up,recovery,factor_change'],
        ]);
        $user = $request->user();
        if (! $this->mfa->hasActiveFactor($user)) {
            return response()->json(['error' => ['code' => 'mfa_enrollment_required']], 403);
        }
        $token = $request->bearerToken();
        $tokenId = $token ? hash('sha256', $token) : null;
        $issued = $this->mfa->issueChallenge($user, $validated['purpose'], $request, $tokenId);

        return response()->json([
            'data' => [
                'challenge_token' => $issued['challenge_token'],
                'expires_at' => $issued['expires_at']->toIso8601String(),
            ],
        ], 201);
    }

    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'challenge_token' => ['required', 'string'],
            'code' => ['required_without:recovery_code', 'string', 'regex:/^\d{6}$/'],
            'recovery_code' => ['required_without:code', 'string'],
            'scope' => ['sometimes', 'string', 'max:60'],
        ]);
        $user = $request->user();
        $ok = false;
        if (! empty($validated['code'])) {
            $ok = $this->mfa->verifyTotpChallenge($user, $validated['challenge_token'], $validated['code'], $request);
        } elseif (! empty($validated['recovery_code'])) {
            $ok = $this->mfa->useRecoveryCode($user, $validated['recovery_code'], $request);
        }
        if (! $ok) {
            return response()->json(['error' => ['code' => 'mfa_verification_failed']], 403);
        }
        $scope = $validated['scope'] ?? 'platform.admin';
        $token = $request->bearerToken();
        $tokenId = $token ? hash('sha256', $token) : null;
        if ($tokenId) {
            $ttl = in_array($scope, ['backup.restore', 'roles.manage', 'security.manage'], true)
                ? StepUpService::SENSITIVE_TTL_MINUTES
                : StepUpService::DEFAULT_TTL_MINUTES;
            $this->stepUp->markVerified($user, $tokenId, $scope, $request, $ttl);
        }

        return response()->json(['data' => ['verified' => true, 'scope' => $scope]]);
    }
}
