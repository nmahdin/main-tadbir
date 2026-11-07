<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * اعتبارسنجی کش برای پاسخ‌های JSON ِ GET (دور ۸۴).
 *
 * چرا لازم شد: کلاینت کش خودش را دارد، اما با هر بار که کش منقضی می‌شد همان
 * بدنهٔ کامل دوباره دانلود می‌شد — حتی وقتی داده هیچ تغییری نکرده بود. با
 * `ETag` مرورگر همان پاسخ را نگه می‌دارد و در درخواست بعدی فقط می‌پرسد «همان
 * است؟»؛ پاسخ ۳۰۴ بدون بدنه می‌آید و اینترنت کاربر مصرف نمی‌شود.
 *
 * محدودهٔ امن:
 *  - فقط `GET`/`HEAD` و فقط پاسخ‌های ۲۰۰ JSON؛ فایل‌ها/استریم‌ها دست‌نخورده‌اند.
 *  - `Cache-Control: private, no-cache` می‌ماند؛ یعنی هیچ پراکسی مشترکی محتوای
 *    سازمانی را کش نمی‌کند و مرورگر هم باید هر بار اعتبارسنجی کند.
 *  - کاربرِ متفاوت، نشانی یکسان دارد اما هدر `Vary: Authorization, Cookie`
 *    (از سوی لایهٔ احراز هویت) و کش اختصاصی مرورگر، پاسخ کاربر دیگری را به او
 *    نشان نمی‌دهد.
 */
class ConditionalJsonCache
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $request->is('api/*') || ! $request->isMethodCacheable()) {
            return $response;
        }
        if (! $response instanceof JsonResponse || $response->getStatusCode() !== 200) {
            return $response;
        }

        // پاسخ‌هایی که خودشان «کش نکن» اعلام کرده‌اند (مثلاً وضعیت حساب بله یا
        // نشست) دست‌نخورده می‌مانند؛ این میدل‌ور اجازهٔ کش به آن‌ها نمی‌دهد.
        if (str_contains(strtolower((string) $response->headers->get('Cache-Control')), 'no-store')) {
            return $response;
        }

        $content = $response->getContent();
        if (! is_string($content) || $content === '') {
            return $response;
        }

        $etag = '"'.sha1($content).'"';
        $response->headers->set('ETag', $etag);
        $response->headers->set('Cache-Control', 'private, no-cache');

        $ifNoneMatch = trim((string) $request->headers->get('If-None-Match', ''));
        if ($ifNoneMatch !== '' && $this->matches($ifNoneMatch, $etag)) {
            // ۳۰۴ هرگز بدنه ندارد؛ همان هدرهای اعتبارسنجی تکرار می‌شوند.
            $notModified = new Response('', Response::HTTP_NOT_MODIFIED);
            $notModified->headers->set('ETag', $etag);
            $notModified->headers->set('Cache-Control', 'private, no-cache');

            return $notModified;
        }

        return $response;
    }

    /** `If-None-Match` می‌تواند چند مقدار یا `*` باشد (مثلاً بعد از فشرده‌سازی پراکسی). */
    private function matches(string $header, string $etag): bool
    {
        if ($header === '*') {
            return true;
        }
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === $etag || $candidate === 'W/'.$etag) {
                return true;
            }
        }

        return false;
    }
}
