<?php

namespace App\Core\Security\Events;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Write security-relevant events to `security_events`. Unlike the
 * general-purpose audit log, security events are typed, outcome-tagged,
 * and redact secrets at write time.
 */
final class SecurityEventWriter
{
    /** Keys that are scrubbed from metadata before persistence. */
    private const REDACTED_KEYS = [
        'password', 'password_confirmation', 'current_password',
        'token', 'access_token', 'refresh_token', 'remember_token',
        'totp_secret', 'secret', 'recovery_code', 'code', 'otp',
        'authorization', 'cookie', 'x-xsrf-token',
    ];

    /**
     * @param  array<string, mixed>|null  $metadata
     */
    public function record(
        string $eventType,
        SecurityEventOutcome $outcome,
        ?User $actor = null,
        ?int $targetUserId = null,
        ?string $targetType = null,
        ?int $targetId = null,
        ?string $scopeType = null,
        ?int $scopeId = null,
        ?array $metadata = null,
        ?Request $request = null,
    ): void {
        DB::table('security_events')->insert([
            'event_type' => $eventType,
            'actor_user_id' => $actor?->id,
            'actor_guard' => $actor !== null ? 'user' : 'system',
            'target_user_id' => $targetUserId,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'scope_type' => $scopeType,
            'scope_id' => $scopeId,
            'outcome' => $outcome->value,
            'request_ip' => $request?->ip(),
            'correlation_id' => $request?->header('X-Correlation-Id'),
            'metadata' => $metadata !== null ? json_encode($this->redact($metadata), JSON_UNESCAPED_SLASHES) : null,
            'occurred_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function redact(array $data): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $isSecret = is_string($key) && in_array(strtolower($key), self::REDACTED_KEYS, true);
            if ($isSecret) {
                $out[$key] = '[REDACTED]';
                continue;
            }
            if (is_array($value)) {
                $out[$key] = $this->redact($value);
                continue;
            }
            $out[$key] = $value;
        }

        return $out;
    }
}
