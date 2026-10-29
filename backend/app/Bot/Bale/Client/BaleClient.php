<?php

namespace App\Bot\Bale\Client;

use Illuminate\Support\Arr;
use Throwable;

final class BaleClient
{
    public function __construct(private BaleHttp $http) {}

    public function call(#[\SensitiveParameter] string $token, string $method, #[\SensitiveParameter] array $parameters = []): mixed
    {
        if (! in_array($method, ['setWebhook', 'getMe', 'getWebhookInfo', 'deleteWebhook', 'getUpdates', 'sendMessage', 'deleteMessage', 'answerCallbackQuery', 'sendDocument', 'getFile'], true)) {
            throw new BaleApiException('unsupported_method');
        }
        try {
            /**
             * پرونده باید در همان درخواست و به‌صورت چندپارتی فرستاده شود؛ بله
             * نشانی(private) فایل‌های ما را نمی‌شناسد. زمانِ انتظار برای ارسال
             * پرونده از زمانِ معمولِ پیام‌ها بیشتر است.
             */
            $file = $parameters['_file'] ?? null;
            $parameters = Arr::except($parameters, ['_file']);
            $timeout = (int) config('bale.request_timeout', 4);
            $request = $this->http->connectTimeout(2)
                ->timeout(is_array($file) ? max(30, $timeout) : $timeout)
                ->withoutRedirecting();
            if (is_array($file) && isset($file['contents'], $file['name'])) {
                $request->attach('document', $file['contents'], (string) $file['name']);
            }
            $response = $request->post('https://tapi.bale.ai/bot'.$token.'/'.$method, $parameters);
        } catch (Throwable) {
            throw new BaleApiException('transport_unknown');
        }

        $data = $response->json();
        if ($response->successful() && is_array($data) && ($data['ok'] ?? false) === true && array_key_exists('result', $data)) {
            return $data['result'];
        }
        $code = (int) ($data['error_code'] ?? $response->status());
        $reason = match ($code) {
            401 => 'unauthorized',
            403 => 'forbidden',
            429 => 'rate_limited',
            400 => 'bad_request',
            409 => 'conflict',
            default => 'response_unknown',
        };
        $retryAfter = $reason === 'rate_limited' ? max(1, min(86400, (int) ($data['parameters']['retry_after'] ?? 60))) : null;
        throw new BaleApiException($reason, $retryAfter);
    }

    /**
     * محتوای پرونده‌ای که کاربر در بات فرستاده است.
     *
     * نشانیِ فایل همان نشانیِ رسمیِ بله است (`/file/bot<token>/<file_path>`) و
     * مسیرِ آن پیش از این فراخوانی با الگوی امن سنجیده شده است. نشانی هیچ‌گاه
     * در پیام‌ها یا گزارش‌ها نمی‌آید.
     *
     * @throws BaleApiException
     */
    public function download(#[\SensitiveParameter] string $token, string $filePath): ?string
    {
        return $this->downloadUrl('https://tapi.bale.ai/file/bot'.$token.'/'.ltrim($filePath, '/'));
    }

    /**
     * دریافتِ محتوای پرونده از نشانیِ خودِ بله.
     *
     * اگر بله در پاسخِ `getFile` نشانیِ کامل برگرداند، همین متد استفاده می‌شود؛
     * میزبان باید روی `bale.ai` باشد و تغییرمسیر هم فقط داخل همین دامنه
     * پذیرفته می‌شود. بله فایل را گاهی با تغییرمسیر (۳۰۲) می‌دهد؛ پیش‌تر
     * تغییرمسیر دنبال نمی‌شد و دریافتِ پرونده ناموفق می‌ماند.
     *
     * @throws BaleApiException
     */
    public function downloadUrl(#[\SensitiveParameter] string $url): ?string
    {
        if (! $this->isBaleUrl($url)) {
            throw new BaleApiException('unsafe_redirect');
        }
        try {
            $response = $this->http->connectTimeout(2)
                ->timeout((int) max(30, (int) config('bale.request_timeout', 4)))
                ->withOptions(['allow_redirects' => ['max' => 3, 'strict' => true, 'referer' => false, 'protocols' => ['https']]])
                ->get($url);
        } catch (Throwable) {
            throw new BaleApiException('transport_unknown');
        }
        $final = (string) $response->effectiveUri();
        if ($final !== '' && ! $this->isBaleUrl($final)) {
            throw new BaleApiException('unsafe_redirect');
        }
        if (! $response->successful()) {
            $code = (int) $response->status();
            throw new BaleApiException(match ($code) { 401 => 'unauthorized', 403 => 'forbidden', 429 => 'rate_limited', 400 => 'bad_request', 404 => 'not_found', default => 'response_unknown' });
        }

        return $response->body();
    }

    /**
     * فقط نشانیِ https روی میزبان‌های رسمیِ بله پذیرفته می‌شود.
     *
     * بله فایل‌ها را روی `tapi.bale.ai` و گاهی `ble.ir` (نشانیِ کوتاهِ خودش)
     * می‌دهد؛ هر دو دامنه و زیردامنه‌هایشان مجازند و هر میزبانِ دیگری رد
     * می‌شود تا نشانیِ ناشناخته (SSRF) پذیرفته نشود.
     */
    private function isBaleUrl(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $allowed = false;
        foreach (['bale.ai', 'ble.ir'] as $domain) {
            if ($host === $domain || str_ends_with($host, '.'.$domain)) {
                $allowed = true;
                break;
            }
        }

        return $scheme === 'https' && $allowed;
    }
}
