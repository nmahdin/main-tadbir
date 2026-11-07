<?php

namespace App\Core\Settings;

use RuntimeException;

/**
 * Stable registry failure codes (Stage C7-1):
 * setting_key_invalid, setting_key_duplicate,
 * setting_type_unsupported, setting_scope_unsupported,
 * setting_inheritance_unsupported, setting_sensitivity_unsupported,
 * setting_version_invalid, setting_constraints_invalid,
 * setting_default_invalid, setting_owner_unknown,
 * setting_owner_mismatch, setting_registry_drift,
 * setting_not_found.
 */
final class SettingRegistryException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
