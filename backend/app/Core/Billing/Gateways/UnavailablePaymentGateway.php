<?php

namespace App\Core\Billing\Gateways;

use App\Core\Billing\BillingDomainException;
use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\PaymentGateway;
use App\Core\Billing\Payments\InitiationRequest;
use App\Core\Billing\Payments\InitiationResult;
use App\Core\Billing\Payments\VerificationResult;

/**
 * Safety-default gateway. Selected when `billing.gateway` is
 * 'unavailable' (or no adapter is registered) so that production
 * code cannot accidentally route payments into the sandbox. Any
 * call throws BillingDomainException.
 */
final class UnavailablePaymentGateway implements PaymentGateway
{
    public function name(): string
    {
        return 'unavailable';
    }

    public function initiate(CoreBillingPayment $payment, InitiationRequest $request): InitiationResult
    {
        throw new BillingDomainException('payment_gateway_unavailable', 'Payment gateway is not configured.');
    }

    public function verify(CoreBillingPayment $payment, array $context = []): VerificationResult
    {
        throw new BillingDomainException('payment_gateway_unavailable', 'Payment gateway is not configured.');
    }

    public function verifyCallbackSignature(array $query, array $headers = []): bool
    {
        return false;
    }

    public function redactDiagnostics(array $payload): array
    {
        return $payload;
    }
}
