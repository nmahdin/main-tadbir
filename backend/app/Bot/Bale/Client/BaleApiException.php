<?php

namespace App\Bot\Bale\Client;

use Illuminate\Contracts\Debug\ShouldntReport;
use RuntimeException;

final class BaleApiException extends RuntimeException implements ShouldntReport
{
    public function __construct(
        public readonly string $reason,
        public readonly ?int $retryAfter = null,
    ) {
        // Never retain the original HTTP exception, URL, description or response body.
        parent::__construct('ارتباط با بله ناموفق بود. کد خطای امن: '.$reason);
    }
}
