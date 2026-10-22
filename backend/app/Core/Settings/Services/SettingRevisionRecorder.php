<?php

namespace App\Core\Settings\Services;

use App\Core\Settings\CoreSettingRevision;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\StoredSettingValue;

/**
 * Append-only revision writer (Stage C7-3).
 *
 * Called INSIDE the same transaction as the mutation and its
 * audit record: if any of the three fails, all three roll back.
 * Secret definitions are refused here as a second line of defense
 * — secret material must never reach a revision row.
 */
final class SettingRevisionRecorder
{
    public function __construct(
        private readonly SettingsRegistry $registry,
    ) {}

    public function record(
        string $ownerType,
        int $ownerId,
        string $key,
        string $operation,
        StoredSettingValue $previous,
        StoredSettingValue $new,
        int $resultingVersion,
        ?int $actorUserId,
        ?int $auditLogId,
    ): CoreSettingRevision {
        $definition = $this->registry->get($key);
        if ($definition->sensitivity === SettingDefinition::SENSITIVITY_SECRET) {
            throw new \LogicException("Secret setting [{$key}] must never be written to revision history.");
        }

        return CoreSettingRevision::query()->create([
            'setting_key' => $key,
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'operation' => $operation,
            'version' => $resultingVersion,
            'previous_present' => $previous->exists,
            'previous_value_json' => $previous->exists ? (string) json_encode($previous->value, JSON_UNESCAPED_SLASHES) : null,
            'new_present' => $new->exists,
            'new_value_json' => $new->exists ? (string) json_encode($new->value, JSON_UNESCAPED_SLASHES) : null,
            'actor_user_id' => $actorUserId,
            'audit_log_id' => $auditLogId,
            'created_at' => now(),
        ]);
    }
}
