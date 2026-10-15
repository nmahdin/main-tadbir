<?php

namespace App\Core\Audit;

use App\Models\User;

/**
 * The one audit write path (Stage C1). Callers invoke record()
 * inside the transaction that performs the mutation, so the audit
 * row commits or rolls back together with the change — a failed
 * transaction never leaves a misleading success entry.
 *
 * Summaries are masked recursively before storage: any key naming a
 * credential (password, token, secret, authorization, api key, otp)
 * is replaced, whatever the caller passed.
 */
final class AuditWriter
{
    private const MASK = '***';

    private const SENSITIVE_KEY_FRAGMENTS = [
        'password', 'token', 'secret', 'authorization', 'api_key', 'apikey', 'otp', 'credential',
    ];

    /**
     * @param  array<string, mixed>  $summary
     */
    public function record(
        ?User $actor,
        string $action,
        array $summary = [],
        ?string $scopeType = null,
        ?int $scopeId = null,
        ?string $targetType = null,
        ?int $targetId = null,
    ): AuditLog {
        $request = request();

        return AuditLog::create([
            'actor_user_id' => $actor?->id,
            'action' => $action,
            'scope_type' => $scopeType,
            'scope_id' => $scopeId,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'summary' => $this->mask($summary),
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent() !== null ? mb_substr($request->userAgent(), 0, 255) : null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $summary
     * @return array<string, mixed>
     */
    private function mask(array $summary): array
    {
        $masked = [];
        foreach ($summary as $key => $value) {
            $lower = strtolower((string) $key);
            $sensitive = false;
            foreach (self::SENSITIVE_KEY_FRAGMENTS as $fragment) {
                if (str_contains($lower, $fragment)) {
                    $sensitive = true;
                    break;
                }
            }
            $masked[$key] = $sensitive
                ? self::MASK
                : (is_array($value) ? $this->mask($value) : $value);
        }

        return $masked;
    }
}
