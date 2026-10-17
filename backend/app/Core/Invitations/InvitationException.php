<?php

namespace App\Core\Invitations;

use RuntimeException;

/**
 * Stable invitation failure codes (Stage C6-1):
 * invitation_forbidden, invitation_email_invalid,
 * invitation_role_invalid, invitation_role_scope_mismatch,
 * invitation_grant_ceiling, invitation_duplicate_pending,
 * invitation_organization_unavailable, invitation_expiry_invalid,
 * invitation_not_found, invitation_already_accepted,
 * invitation_already_revoked, invitation_invalid_state,
 * invitation_scope_invalid, invitation_message_too_long.
 */
final class InvitationException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
