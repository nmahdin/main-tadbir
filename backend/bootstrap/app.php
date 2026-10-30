<?php

use App\Bot\Bale\Support\OperationsSchema;
use App\Http\Middleware\ApiLocale;
use App\Http\Middleware\EnsureActiveAccount;
use App\Http\Middleware\EnsureMaintenanceMode;
use App\Http\Middleware\EnsureUserHasPermission;
use App\Http\Middleware\RequestCorrelationId;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
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
        // شمارندهٔ فایل‌محور داشبورد عمداً در middleware سراسری ثبت نمی‌شود:
        // هر درخواست را به چند قفل/نوشتن دیسک تبدیل می‌کرد و زیر بار CPU را اشباع می‌کرد.

        // شناسهٔ سبک برای پیگیری خطا، بدون ثبت body/header یا نوشتن metric فایل‌محور.
        $middleware->append(RequestCorrelationId::class);

        // پیام‌های اعتبارسنجیِ API همیشه فارسی باشند (مستقل از APP_LOCALE میزبان)
        // تا خطای ۴۲۲ دلیلِ ردشدن ورودی را بگوید، نه یک متن کلی.
        $middleware->api(prepend: [ApiLocale::class]);

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
            'maintenance-mode' => EnsureMaintenanceMode::class,
            'permission' => EnsureUserHasPermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // خلاصهٔ خطای اعتبارسنجی فارسی شود. خودِ Laravel این خلاصه را با رشتهٔ
        // انگلیسی «The given data was invalid.» می‌سازد که در رابط فارسی فقط
        // یک متن کلی بود؛ جزئیاتِ هر فیلد همچنان در `errors` می‌آید.
        $exceptions->render(function (ValidationException $error, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'اطلاعات واردشده معتبر نیست؛ جزئیات هر فیلد را ببینید.',
                'errors' => $error->errors(),
            ], 422);
        });
        // Never expose SQL, connection details or stack traces to API clients, even if a host enables debug.
        $exceptions->respond(function (Response $response, Throwable $error) {
            if (request()->is('api/*') && $response->getStatusCode() >= 500) {
                $response = $error instanceof HttpExceptionInterface
                    && $error->getMessage() === OperationsSchema::MESSAGE
                    ? response()->json(['message' => $error->getMessage(), 'code' => 'installation_incomplete'], $response->getStatusCode())
                    : response()->json(['message' => 'عملیات انجام نشد. در صورت تکرار مشکل، با مدیر سیستم تماس بگیرید.'], $response->getStatusCode());
            }

            // Exceptions are rendered outside the route middleware pipeline, so
            // copy its identifier onto validation/auth/5xx responses here too.
            $requestId = request()->attributes->get('request_id');
            if (request()->is('api/*') && is_string($requestId) && $requestId !== '') {
                $response->headers->set('X-Request-ID', $requestId);
            }

            return $response;
        });
    })->create();
