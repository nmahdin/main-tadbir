<?php

namespace App\Core\Billing\Gateways;

use App\Core\Billing\CoreBillingPayment;
use App\Core\Billing\PaymentGateway;
use App\Core\Billing\Payments\InitiationRequest;
use App\Core\Billing\Payments\InitiationResult;
use App\Core\Billing\Payments\VerificationResult;
use Illuminate\Support\Str;

/**
 * Deterministic fake adapter used in automated tests. Controlled by
 * URL-query markers carried through callback_url and by test-only
 * `_sandbox_outcome` metadata on the payment row (stored via the
 * diagnostics column in tests). Supports:
 *
 *   - Normal success:  callback carries ?sandbox=settle
 *   - Pending:         callback carries ?sandbox=pending then ?sandbox=settle
 *   - Failure:         callback carries ?sandbox=fail
 *   - Amount mismatch: callback carries ?sandbox=badamount
 *   - Forged callback: any other / unsigned token
 *
 * NEVER enabled outside testing; factory binding is gated to
 * APP_ENV=testing. Production config uses an explicit provider or
 * 'unavailable'.
 */
final class SandboxPaymentGateway implements PaymentGateway
{
    public const TOKEN_PREFIX = 'sbx_';

    public function name(): string
    {
        return 'sandbox';
    }

    public function initiate(CoreBillingPayment $payment, InitiationRequest $request): InitiationResult
    {
        $providerId = 'SND-'.Str::upper(Str::random(12));
        $authority = self::TOKEN_PREFIX.Str::lower(Str::random(24));
        $sep = str_contains($request->callbackUrl, '?') ? '&' : '?';
        $redirect = $request->callbackUrl.$sep.'sandbox_authority='.urlencode($authority).'&sandbox_payment='.urlencode($providerId);

        return InitiationResult::redirect(
            $redirect,
            $providerId,
            $authority,
            ['provider' => $this->name(), 'amount_toman' => $request->amountToman],
        );
    }

    public function verify(CoreBillingPayment $payment, array $context = []): VerificationResult
    {
        $outcome = (string) ($context['sandbox_outcome'] ?? $context['sandbox'] ?? 'settle');
        $authority = (string) ($context['authority'] ?? $context['sandbox_authority'] ?? $payment->provider_authority ?? '');
        $verifiedAmount = (int) ($context['verified_amount_toman'] ?? $payment->requested_amount_toman);

        if ($outcome === 'pending') {
            return VerificationResult::pending('Provider has not finalized.', ['outcome' => 'pending']);
        }
        if ($outcome === 'fail' || $authority === '' || !str_starts_with($authority, self::TOKEN_PREFIX)) {
            return VerificationResult::failed('payment_failed', 'Payment was not settled at provider.', ['outcome' => $outcome]);
        }
        if ($outcome === 'badamount' || $verifiedAmount !== (int) $payment->requested_amount_toman) {
            return VerificationResult::paid($verifiedAmount,
                (string) ($payment->requested_currency ?? 'TOMAN'),
                'TXN-BAD', null, null, ['outcome' => 'badamount']);
        }

        return VerificationResult::paid(
            $verifiedAmount,
            (string) ($payment->requested_currency ?? 'TOMAN'),
            'TXN-'.Str::upper(Str::random(10)),
            'TRACE-'.Str::upper(Str::random(6)),
            '6037-****-****-1111',
            ['outcome' => 'settle'],
        );
    }

    public function verifyCallbackSignature(array $query, array $headers = []): bool
    {
        $auth = (string) ($query['sandbox_authority'] ?? '');
        $pid = (string) ($query['sandbox_payment'] ?? '');
        // A test-only sanity check — real providers sign callbacks.
        return $auth !== '' && $pid !== '' && str_starts_with($auth, self::TOKEN_PREFIX);
    }

    public function redactDiagnostics(array $payload): array
    {
        // Sandbox has no secrets to redact; strip any 'card'/'pan'/'cvv'/'secret' fields defensively.
        foreach (['card_number', 'pan', 'cvv', 'cvv2', 'password', 'secret', 'api_key', 'access_token'] as $k) {
            unset($payload[$k]);
        }

        return $payload;
    }
}
