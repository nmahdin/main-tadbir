<?php

namespace App\Bot\Bale\Client;

use Throwable;

final class BaleClient
{
    public function __construct(private BaleHttp $http) {}

    public function call(#[\SensitiveParameter] string $token, string $method, array $parameters = []): mixed
    {
        if (! in_array($method, ['getMe', 'getWebhookInfo', 'deleteWebhook', 'getUpdates', 'sendMessage', 'answerCallbackQuery'], true)) {
            throw new BaleApiException('unsupported_method');
        }
        try {
            $response = $this->http->connectTimeout(2)
                ->timeout(config('bale.request_timeout', 4))
                ->withoutRedirecting()
                ->post('https://tapi.bale.ai/bot'.$token.'/'.$method, $parameters);
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
