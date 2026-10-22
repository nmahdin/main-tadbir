<?php

namespace App\Core\Identity;

/**
 * Production mail-transport guard (Stage C6-3).
 *
 * The `log` and `array` mailers silently drop messages; outside
 * local/testing they must never count as successful delivery.
 * Real transports (smtp, sendmail, ses, ...) are configured purely
 * through the standard MAIL_* environment variables — no
 * credentials are invented or stored in the repository.
 */
final class MailTransportGuard
{
    /**
     * @throws EmailVerificationException email_delivery_unavailable
     */
    public static function assertDeliverable(): void
    {
        if (app()->environment(['local', 'testing'])) {
            return;
        }

        $mailer = (string) config('mail.default', '');

        if (in_array($mailer, ['', 'log', 'array'], true)) {
            throw new EmailVerificationException(
                'email_delivery_unavailable',
                'Email delivery is not configured with a real transport.'
            );
        }
    }
}
