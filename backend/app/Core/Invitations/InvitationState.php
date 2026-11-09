<?php

namespace App\Core\Invitations;

/**
 * Effective invitation state (Stage C6-1).
 *
 * Stored status is only pending|accepted|revoked; expiry is
 * derived deterministically from `expires_at` in UTC, so a pending
 * invitation whose expiry has elapsed is effectively Expired
 * without any scheduled rewrite (no cron dependency).
 */
enum InvitationState: string
{
    case PendingAcceptance = 'pending';
    case Expired = 'expired';
    case Accepted = 'accepted';
    case Revoked = 'revoked';
}
