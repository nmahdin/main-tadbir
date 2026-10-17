<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Invitation message (Stage C6-3). Contains the invitation-page
 * link; views escape every interpolated value. The raw token
 * exists only inside this link and in the one-time issuance
 * response — never in logs or audit records.
 */
final class InvitationMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $invitationUrl,
        public readonly string $inviterName,
        public readonly ?string $organizationName = null,
        public readonly ?string $workspaceName = null,
        public readonly ?string $message = null,
        public readonly ?string $expiresAt = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'You have been invited to join TADBIR');
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.invitation',
            text: 'emails.invitation-text',
        );
    }
}
