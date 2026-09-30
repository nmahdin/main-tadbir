<?php

use App\Bot\Bale\Support\OperationsSchema;
use App\Http\Middleware\EnsureActiveAccount;
use App\Http\Middleware\EnsureUserHasPermission;
use App\Http\Middleware\RecordSystemMetrics;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // شمارنده‌های عملیاتی ناشناس برای داشبورد سلامت؛ بدون ذخیره مسیر، کاربر یا payload.
        $middleware->append(RecordSystemMetrics::class);

        // فعال‌سازی احراز هویت مبتنی بر کوکی/نشست برای SPA (Sanctum).
        $middleware->statefulApi();

        // درخواست‌های API را به صفحه ورود Redirect نکن.
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*')
                ? null
                : (Route::has('login') ? route('login') : null)
        );

        $middleware->alias([
            'active-account' => EnsureActiveAccount::class,
            'permission' => EnsureUserHasPermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // Never expose SQL, connection details or stack traces to API clients, even if a host enables debug.
        $exceptions->respond(function (Response $response, Throwable $error) {
            if (request()->is('api/*') && $response->getStatusCode() >= 500) {
                if ($error instanceof HttpExceptionInterface
                    && $error->getMessage() === OperationsSchema::MESSAGE) {
                    return response()->json(['message' => $error->getMessage(), 'code' => 'installation_incomplete'], $response->getStatusCode());
                }

                return response()->json(['message' => 'عملیات انجام نشد. در صورت تکرار مشکل، با مدیر سیستم تماس بگیرید.'], $response->getStatusCode());
            }

            return $response;
        });
    })->create();
