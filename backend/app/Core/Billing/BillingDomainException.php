<?php

namespace App\Core\Billing;

use RuntimeException;

final class BillingDomainException extends RuntimeException
{
    public readonly string $errorCode;

    public function __construct(string $errorCode, string $message)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
    }
}
