<?php

namespace App\Core\Billing\Payments;

final class InitiationRequest
{
    public function __construct(
        public readonly int $amountToman,
        public readonly string $currency,
        public readonly string $description,
        public readonly string $callbackUrl,
        public readonly ?string $mobile = null,
        public readonly ?string $email = null,
    ) {}
}
