<?php

namespace App\Core\Platform\Operations;

/**
 * A cryptographically verified operational request (Stage C2-4).
 *
 * Produced only by OperationTokenVerifier after HMAC verification,
 * structural validation, and expiry checks. The operator identity
 * is the independently established infrastructure-operator
 * identifier bound into the signed payload — it is not, and never
 * becomes, an application user.
 */
final readonly class VerifiedOperation
{
    /**
     * @param  list<string>  $evidenceReferences
     */
    public function __construct(
        public string $operation,
        public string $requestId,
        public string $operatorId,
        public string $targetUsername,
        public ?string $incidentId,
        public ?string $incidentReason,
        public array $evidenceReferences,
        public ?string $verificationMethod,
        public ?string $verificationReference,
    ) {}

    public function isBootstrap(): bool
    {
        return $this->operation === 'bootstrap';
    }

    public function isRecovery(): bool
    {
        return $this->operation === 'recovery';
    }
}
