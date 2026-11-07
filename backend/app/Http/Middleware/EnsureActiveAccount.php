<?php

namespace App\Http\Middleware;

use App\Core\Identity\AccountStatus;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        // Logout remains available even after suspension. Every other authenticated
        // endpoint, including routes without permission middleware, fails closed.
        if ($request->routeIs('api.v1.auth.logout')) {
            return $next($request);
        }

        // Re-read persisted state, including already-authenticated sessions.
        $request->user()?->refresh();

        if ($request->user()?->isActive()) {
            return $next($request);
        }

        // C6 amendment (invitation onboarding): a PENDING account may
        // reach ONLY the verified-email endpoints, so an invited user
        // can prove mailbox control and become eligible for invitation
        // acceptance without manual administrator activation. Every
        // other endpoint — including invitation acceptance itself —
        // still requires an active account, and suspended/deactivated/
        // blocked/inactive accounts get no exception anywhere.
        if (
            AccountStatus::of($request->user()?->status) === AccountStatus::Pending
            && $request->routeIs('api.v1.auth.email.verification.*')
        ) {
            return $next($request);
        }

        abort(403, 'حساب کاربری شما فعال نیست.');
    }
}
