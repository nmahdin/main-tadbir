<?php

namespace App\Http\Controllers\Api\V1\Core\Security;

use App\Core\Security\Sessions\StepUpService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Session visibility and revocation (C7-B). Uses Sanctum tokens as
 * the session record; we list/revoke via the authenticated user's
 * tokens and clear step-up state on revoke.
 */
final class SessionController extends Controller
{
    public function __construct(private readonly StepUpService $stepUp) {}

    public function index(Request $request): JsonResponse
    {
        $tokens = PersonalAccessToken::query()
            ->where('tokenable_id', $request->user()->id)
            ->where('tokenable_type', get_class($request->user()))
            ->orderByDesc('last_used_at')
            ->get()
            ->map(fn (PersonalAccessToken $t): array => [
                'id' => $t->id,
                'name' => $t->name,
                'created_at' => $t->created_at?->toIso8601String(),
                'last_used_at' => $t->last_used_at?->toIso8601String(),
                'ip' => $t->last_used_ip ?? null,
                'is_current' => $this->currentTokenId($request) === $t->id,
            ]);

        return response()->json(['data' => $tokens]);
    }

    public function revoke(Request $request, int $tokenId): JsonResponse
    {
        $user = $request->user();
        $token = PersonalAccessToken::query()
            ->where('id', $tokenId)
            ->where('tokenable_id', $user->id)
            ->firstOrFail();
        $token->delete();
        $this->stepUp->revokeForUser($user);

        return response()->json(['data' => ['revoked' => true]]);
    }

    public function revokeOthers(Request $request): JsonResponse
    {
        $user = $request->user();
        $current = $this->currentTokenId($request);
        PersonalAccessToken::query()
            ->where('tokenable_id', $user->id)
            ->where('id', '!=', $current)
            ->delete();
        $this->stepUp->revokeForUser($user);

        return response()->json(['data' => ['revoked_others' => true]]);
    }

    public function stepUpStatus(Request $request): JsonResponse
    {
        $user = $request->user();
        $token = $request->bearerToken();
        $tokenId = $token ? hash('sha256', $token) : null;
        $scopes = $tokenId ? DB::table('security_step_up_sessions')
            ->where('user_id', $user->id)
            ->where('auth_token_id', $tokenId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->pluck('scope', 'expires_at') : [];

        return response()->json(['data' => ['scopes' => $scopes]]);
    }

    private function currentTokenId(Request $request): ?int
    {
        $token = $request->user()->currentAccessToken();

        return $token?->id;
    }
}
