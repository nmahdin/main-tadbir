<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * بررسی دسترسی کاربر بر پایه ماتریس دسترسی نقش‌ها.
 *
 * نمونه استفاده در مسیرها:
 *   Route::post('projects', ...)->middleware('permission:projects.create');
 */
class EnsureUserHasPermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'message' => 'برای انجام این عملیات باید وارد سامانه شوید.',
            ], 401);
        }

        if ($permissions !== [] && ! $user->hasAnyPermission($permissions)) {
            return response()->json([
                'message' => 'شما دسترسی لازم برای انجام این عملیات را ندارید.',
                'required_permissions' => $permissions,
            ], 403);
        }

        return $next($request);
    }
}
