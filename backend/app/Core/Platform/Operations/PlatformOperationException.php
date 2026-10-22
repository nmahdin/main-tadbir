<?php

namespace App\Core\Platform\Operations;

use DomainException;

/**
 * A bootstrap/recovery operation was rejected. `errorCode` is a
 * stable machine-readable reason (never contains secret material):
 *
 *  token_malformed, token_signature_invalid, token_expired,
 *  operations_not_configured, request_replayed,
 *  bootstrap_closed, bootstrap_history_exists,
 *  bootstrap_not_completed, target_not_found,
 *  target_not_operational, incident_evidence_missing,
 *  recovery_not_needed, operation_conflict
 */
final class PlatformOperationException extends DomainException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
