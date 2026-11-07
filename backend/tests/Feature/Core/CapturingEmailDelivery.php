<?php

namespace Tests\Feature\Core;

use App\Core\Identity\EmailVerificationDelivery;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Capturing delivery test double for the documented email
 * verification delivery port (Stage C6-2). Exercises the genuine
 * EmailVerificationService flow end to end without a transport.
 */
final class CapturingEmailDelivery implements EmailVerificationDelivery
{
    /** @var list<array{email: string, token: string}> */
    public array $sent = [];

    public function deliver(User $user, string $normalizedEmail, string $rawToken, CarbonImmutable $expiresAt): void
    {
        $this->sent[] = ['email' => $normalizedEmail, 'token' => $rawToken];
    }

    public function lastToken(): string
    {
        return $this->sent[count($this->sent) - 1]['token'];
    }
}
