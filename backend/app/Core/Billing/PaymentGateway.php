<?php

namespace App\Core\Billing;

use App\Core\Billing\Payments\InitiationRequest;
use App\Core\Billing\Payments\InitiationResult;
use App\Core\Billing\Payments\VerificationResult;

/**
 * Provider-neutral PSP adapter contract (C5-M3-B).
 *
 * Implementations must:
 *   - Never accept browser-facing parameters as settlement proof.
 *   - Verify transactions via trusted server-side communication.
 *   - Compare verified amount / currency / merchant / order.
 *   - Redact secrets before persisting anything to the events log.
 */
interface PaymentGateway
{
    /** Stable machine provider name (e.g. 'sandbox', 'zibal', 'novinopay'). */
    public function name(): string;

    /**
     * Initiate a payment and return a redirect action plus provider identifiers.
     *
     * Implementations MUST return deterministic results when the provider_ref is stable.
     */
    public function initiate(CoreBillingPayment $payment, InitiationRequest $request): InitiationResult;

    /**
     * Server-side authoritative verification.
     *
     * @param  array<string, mixed>  $context  trusted server state (NOT user-supplied)
     */
    public function verify(CoreBillingPayment $payment, array $context = []): VerificationResult;

    /**
     * Verify the incoming callback signature / token if the provider supports one.
     *
     * Returns false if the callback is forged or cannot be authenticated.
     *
     * @param  array<string, mixed>  $query  the URL query parameters from the provider return
     * @param  array<string, mixed>  $headers  request headers from the provider callback
     */
    public function verifyCallbackSignature(array $query, array $headers = []): bool;

    /** Redact a provider request/response payload for persistence. */
    public function redactDiagnostics(array $payload): array;
}
