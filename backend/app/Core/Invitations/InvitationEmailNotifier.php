<?php

namespace App\Core\Invitations;

use App\Core\Identity\MailTransportGuard;
use App\Mail\InvitationMail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * One-shot invitation email (Stage C6-3).
 *
 * Called by the HTTP layer only AFTER the issuance transaction
 * has committed, so a link is never sent for rolled-back state.
 * Exactly one send attempt is made per issuance response — the
 * notifier never retries, so a retried HTTP request can never
 * double-send (a repeated create is additionally rejected by the
 * deterministic duplicate-pending rule). Delivery failure is
 * reported to the caller as `failed` (never silently successful);
 * recovery is revoke + reissue, which mints a fresh token/link.
 * Neither the token nor the recipient address is logged.
 */
final class InvitationEmailNotifier
{
    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public static function acceptUrl(string $rawToken): string
    {
        $base = rtrim((string) config('invitations.frontend_base_url'), '/');

        return $base.(string) config('invitations.invitation_path').'?token='.urlencode($rawToken);
    }

    public function notifyIssued(IssuedInvitation $issued, string $inviterName): string
    {
        $invitation = $issued->invitation;

        try {
            MailTransportGuard::assertDeliverable();

            Mail::to($invitation->email_normalized)->send(new InvitationMail(
                self::acceptUrl($issued->rawToken),
                $inviterName,
                $invitation->organization()->first()?->name
                    ?? $invitation->workspace()->first()?->organization()->first()?->name,
                $invitation->workspace()->first()?->name,
                $invitation->message,
                $invitation->expires_at?->toIso8601String(),
            ));

            return self::STATUS_SENT;
        } catch (Throwable) {
            Log::error('invitation_email_delivery_failed', [
                'invitation_id' => (int) $invitation->id,
            ]);

            return self::STATUS_FAILED;
        }
    }
}
