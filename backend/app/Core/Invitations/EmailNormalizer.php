<?php

namespace App\Core\Invitations;

/**
 * Destination-email normalization for invitations (Stage C6-1).
 *
 * Normalization is deliberately conservative and deterministic:
 * trim surrounding whitespace and lowercase the whole address
 * (matching the industry-standard treatment of the domain part
 * and the de-facto case-insensitivity of mailbox providers), then
 * validate the result. The normalized form is what gets stored
 * and compared at acceptance (C6-2); no aliases, dots, or plus
 * tags are rewritten — inventing mailbox-equivalence rules here
 * would silently merge distinct destinations.
 */
final class EmailNormalizer
{
    /**
     * @throws InvitationException invitation_email_invalid
     */
    public static function normalize(string $email): string
    {
        $normalized = mb_strtolower(trim($email));

        if ($normalized === '' || filter_var($normalized, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvitationException('invitation_email_invalid', 'The invitation email address is not valid.');
        }

        return $normalized;
    }
}
