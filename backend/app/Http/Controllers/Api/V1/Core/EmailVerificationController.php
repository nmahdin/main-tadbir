<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Identity\EmailVerificationException;
use App\Core\Identity\EmailVerificationService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Authenticated verified-email endpoints (Stage C6-3 over the
 * Stage C6-2 service). A user can only verify an address for
 * their own account, only by proving the single-use challenge
 * delivered to that address. The raw challenge token never
 * appears in any response; the account email itself is exposed
 * only to its authenticated owner (the User model keeps it
 * hidden from all other serialization). Rate limits are applied
 * at the routes.
 */
final class EmailVerificationController extends Controller
{
    public function __construct(
        private readonly EmailVerificationService $verification,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();

        return response()->json([
            'data' => [
                'email' => $user->email,
                'email_verified' => $user->email_verified_at !== null,
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            ],
        ]);
    }

    public function request(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:254'],
        ]);

        try {
            $issued = $this->verification->requestChallenge($request->user(), $data['email']);
        } catch (EmailVerificationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'data' => [
                'email' => $issued->normalizedEmail,
                'expires_at' => $issued->expiresAt->toIso8601String(),
                'delivery' => 'sent',
            ],
        ], 202);
    }

    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:512'],
        ]);

        try {
            $user = $this->verification->confirmEmail($request->user(), $data['token']);
        } catch (EmailVerificationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'data' => [
                'email' => $user->email,
                'email_verified' => true,
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            ],
        ]);
    }

    private function domainError(EmailVerificationException $exception): JsonResponse
    {
        $status = match ($exception->errorCode) {
            'email_already_claimed' => 409,
            'email_delivery_unavailable' => 503,
            'email_delivery_failed' => 502,
            default => 422,
        };

        return response()->json([
            'message' => $exception->getMessage(),
            'code' => $exception->errorCode,
        ], $status);
    }
}
