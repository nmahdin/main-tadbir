<?php

namespace App\Core\Billing\Payments;

final class InitiationResult
{
    public function __construct(
        public readonly bool $ok,
        public readonly ?string $redirectUrl = null,
        public readonly ?string $providerPaymentId = null,
        public readonly ?string $authority = null,
        public readonly ?string $errorCode = null,
        public readonly ?string $errorMessage = null,
        public readonly array $diagnostics = [],
    )
    {
    }

    public static function redirect(string $url, string $providerPaymentId, ?string $authority, array $diag = []): self
    {
        return new self(true, $url, $providerPaymentId, $authority, null, null, $diag);
    }

    public static function fail(string $code, string $message, array $diag = []): self
    {
        return new self(false, null, null, null, $code, $message, $diag);
    }
}
