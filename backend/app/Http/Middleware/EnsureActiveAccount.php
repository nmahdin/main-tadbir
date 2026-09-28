<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        // Logout remains available even after suspension. Every other authenticated
        // endpoint, including routes without permission middleware, fails closed.
        if (! $request->routeIs('api.v1.auth.logout')) {
            // Re-read persisted state, including already-authenticated sessions.
            $request->user()?->refresh();
            abort_unless($request->user()?->isActive(), 403, 'حساب کاربری شما فعال نیست.');
        }

        return $next($request);
    }
}
