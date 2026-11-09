<?php

namespace App\Core\Billing\Payments;

final class VerificationResult
{
    public const PAID = 'paid';
    public const PENDING = 'pending';
    public const FAILED = 'failed';

    public function __construct(
        public readonly string $outcome, // paid|pending|failed
        public readonly ?int $verifiedAmountToman = null,
        public readonly ?string $verifiedCurrency = null,
        public readonly ?string $providerTransactionId = null,
        public readonly ?string $providerTraceId = null,
        public readonly ?string $maskedCardPan = null,
        public readonly ?string $errorCode = null,
        public readonly ?string $errorMessage = null,
        public readonly array $diagnostics = [],
    ) {}

    public static function paid(int $amount, string $currency, string $txnId, ?string $traceId = null, ?string $cardPan = null, array $diag = []): self
    {
        return new self(self::PAID, $amount, $currency, $txnId, $traceId, $cardPan, null, null, $diag);
    }

    public static function pending(?string $message = null, array $diag = []): self
    {
        return new self(self::PENDING, null, null, null, null, null, 'provider_pending', $message ?? 'Payment pending at provider.', $diag);
    }

    public static function failed(string $code, string $message, array $diag = []): self
    {
        return new self(self::FAILED, null, null, null, null, null, $code, $message, $diag);
    }

    public function isPaid(): bool
    {
        return $this->outcome === self::PAID;
    }

    public function isPending(): bool
    {
        return $this->outcome === self::PENDING;
    }
}
