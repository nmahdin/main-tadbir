<?php

namespace App\Http\Middleware;

use App\Core\Security\Mfa\MfaService;
use App\Core\Security\Sessions\StepUpService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce that the calling user has both an active MFA factor and a
 * recent step-up verification for a declared scope. Returns 403 with
 * a stable error code the frontend can route to the challenge UI:
 *   - mfa_enrollment_required  (no factor configured)
 *   - step_up_required         (factor present but no recent step-up)
 *
 * Sensitive endpoints (role/permission changes, backup restore,
 * maintenance activation) apply this middleware by route name/key.
 */
final class RequireStepUp
{
    public function __construct(
        private readonly MfaService $mfa,
        private readonly StepUpService $stepUp,
    ) {}

    public function handle(Request $request, Closure $next, string $scope = 'platform.admin'): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => ['code' => 'unauthenticated']], 401);
        }
        if (! $this->mfa->hasActiveFactor($user)) {
            return response()->json(['error' => ['code' => 'mfa_enrollment_required', 'scope' => $scope]], 403);
        }
        $token = $request->bearerToken();
        $tokenId = $token ? hash('sha256', $token) : null;
        if (! $tokenId || ! $this->stepUp->isVerified($user, $tokenId, $scope)) {
            return response()->json(['error' => ['code' => 'step_up_required', 'scope' => $scope]], 403);
        }

        return $next($request);
    }
}
