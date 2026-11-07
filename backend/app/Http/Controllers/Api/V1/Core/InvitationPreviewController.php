<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Invitations\InvitationPresenter;
use App\Core\Invitations\InvitationService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public, read-only invitation preview (Stage C6-3).
 *
 * Unauthenticated and rate-limited at the route. The token
 * travels in the POST body — never in a URL that access logs,
 * proxies, or referrers could capture. Preview is strictly
 * read-only: it never consumes, reserves, or mutates the
 * invitation, and presenting it requires no account.
 *
 * Privacy contract (InvitationPresentation, Stage C6-1): pending
 * invitations expose only public organization metadata
 * (`settings.public`), names, intended-role display summaries,
 * the inviter's display name, the optional message, and expiry.
 * Non-pending invitations collapse to a minimal safe status with
 * NO scope details. Unknown tokens return a stable 404
 * (invitation_not_found) indistinguishable in shape from other
 * lookup failures. Responses are never cacheable and carry a
 * no-referrer policy.
 */
final class InvitationPreviewController extends Controller
{
    public function __construct(
        private readonly InvitationService $invitations,
        private readonly InvitationPresenter $presenter,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:512'],
        ]);

        $invitation = $this->invitations->resolveByRawToken($data['token']);

        if ($invitation === null) {
            return $this->noStore(response()->json([
                'message' => 'This invitation link is invalid.',
                'code' => 'invitation_not_found',
            ], 404));
        }

        if ($this->invitations->effectiveState($invitation)->value !== 'pending') {
            return $this->noStore(response()->json([
                'data' => [
                    'invitation' => [
                        'status' => $this->invitations->effectiveState($invitation)->value,
                    ],
                ],
            ]));
        }

        return $this->noStore(response()->json([
            'data' => $this->presenter->present($invitation)->toArray(),
        ]));
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        return $response
            ->header('Cache-Control', 'no-store, private')
            ->header('Referrer-Policy', 'no-referrer')
            ->header('X-Content-Type-Options', 'nosniff');
    }
}
