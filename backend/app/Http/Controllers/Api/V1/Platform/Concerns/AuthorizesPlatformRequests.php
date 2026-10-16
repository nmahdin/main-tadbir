<?php

namespace App\Http\Controllers\Api\V1\Platform\Concerns;

use App\Core\Platform\PlatformAuthorizationException;
use App\Core\Platform\PlatformAuthorizer;
use App\Core\Platform\PlatformVersionConflictException;
use App\Core\Rbac\RbacValidationException;
use App\Models\User;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Shared HTTP authorization + error contract for Platform
 * endpoints (Stage C2-3).
 *
 * Every endpoint requires an authenticated (Sanctum, enforced by
 * the route group), operationally active account holding the
 * endpoint's platform permission, evaluated by PlatformAuthorizer.
 * Legacy admin status confers nothing here.
 *
 * Stable error contract:
 *  - 401 unauthenticated (framework/Sanctum);
 *  - 403 {code: platform_forbidden};
 *  - 404 unknown route-model (framework binding);
 *  - 409 {code: platform_role_version_conflict};
 *  - 422 validation (framework) or {code:
 *    platform_operation_rejected} for domain-rule rejections.
 */
trait AuthorizesPlatformRequests
{
    protected function platformActor(Request $request, string $permission): User
    {
        $actor = $request->user()->fresh();
        if (! app(PlatformAuthorizer::class)->allows($actor, $permission)) {
            abort(response()->json([
                'message' => 'دسترسی مدیریت پلتفرم برای این عملیات مجاز نیست.',
                'code' => 'platform_forbidden',
            ], 403));
        }

        return $actor;
    }

    protected function platformRespond(Closure $operation): JsonResponse
    {
        try {
            return $operation();
        } catch (PlatformAuthorizationException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => 'platform_forbidden',
            ], 403);
        } catch (PlatformVersionConflictException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => 'platform_role_version_conflict',
            ], 409);
        } catch (RbacValidationException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => 'platform_operation_rejected',
            ], 422);
        }
    }

    protected function perPage(Request $request): int
    {
        return max(1, min($request->integer('per_page', 20), 100));
    }
}
