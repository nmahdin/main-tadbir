<?php

namespace App\Core\Identity\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Email-verification message (Stage C6-3). Contains the
 * single-use confirmation link built by the delivery adapter;
 * views escape every interpolated value.
 */
final class EmailVerificationMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $verificationUrl,
        public readonly int $expiresInMinutes,
        public readonly ?string $recipientName = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Verify your email address');
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.email-verification',
            text: 'emails.email-verification-text',
        );
    }
}
