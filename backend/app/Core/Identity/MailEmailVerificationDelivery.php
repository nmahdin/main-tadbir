<?php

namespace App\Core\Identity;

use App\Core\Identity\Mail\EmailVerificationMail;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Real email-verification delivery (Stage C6-3): renders the
 * confirmation link through Laravel Mail using the
 * environment-configured transport (MAIL_MAILER / MAIL_* — never
 * invented credentials).
 *
 * Failure behavior is explicit: the production guard rejects
 * log/array transports outside local/testing
 * (email_delivery_unavailable) and any transport exception is
 * wrapped as email_delivery_failed. The challenge row was already
 * committed by EmailVerificationService before delivery is
 * attempted, so a failed send never references rolled-back state;
 * recovery is simply requesting a new challenge (which invalidates
 * the undelivered one).
 */
final class MailEmailVerificationDelivery implements EmailVerificationDelivery
{
    public function __construct(
        private readonly int $lifetimeMinutes = EmailVerificationService::CHALLENGE_LIFETIME_MINUTES,
    ) {}

    public function deliver(User $user, string $normalizedEmail, string $rawToken, CarbonImmutable $expiresAt): void
    {
        MailTransportGuard::assertDeliverable();

        $base = rtrim((string) config('invitations.frontend_base_url'), '/');
        $path = (string) config('invitations.verification_path');
        $url = $base.$path.'?token='.urlencode($rawToken).'&email='.urlencode($normalizedEmail);

        try {
            Mail::to($normalizedEmail)->send(new EmailVerificationMail($url, $this->lifetimeMinutes, $user->name));
        } catch (EmailVerificationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            throw new EmailVerificationException(
                'email_delivery_failed',
                'The verification email could not be sent; request a new verification challenge.'
            );
        }
    }
}
