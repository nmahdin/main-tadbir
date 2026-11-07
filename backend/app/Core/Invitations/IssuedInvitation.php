<?php

namespace App\Core\Invitations;

/**
 * The result of issuing an invitation (Stage C6-1).
 *
 * This is the ONLY place the raw token ever exists outside the
 * invitee's hands: it is returned once to the caller (a trusted
 * delivery workflow owned by later stages) and is never
 * persisted, logged, or auditable. Persisted state holds only
 * `token_hash` (see InvitationToken).
 */
final readonly class IssuedInvitation
{
    public function __construct(
        public CoreInvitation $invitation,
        public string $rawToken,
    ) {}
}
