<?php

namespace App\Bot\Bale\Client;

use Illuminate\Support\Arr;
use Throwable;

final class BaleClient
{
    public function __construct(private BaleHttp $http) {}

    public function call(#[\SensitiveParameter] string $token, string $method, #[\SensitiveParameter] array $parameters = []): mixed
    {
        if (! in_array($method, ['setWebhook', 'getMe', 'getWebhookInfo', 'deleteWebhook', 'getUpdates', 'sendMessage', 'deleteMessage', 'answerCallbackQuery', 'sendDocument'], true)) {
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
}
