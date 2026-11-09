<?php

namespace App\Core\Settings;

use RuntimeException;

/**
 * Stable value-validation failure codes (Stage C7-1):
 * setting_value_invalid, setting_value_type_mismatch,
 * setting_value_too_long, setting_value_out_of_range,
 * setting_enum_invalid, setting_timezone_invalid,
 * setting_locale_invalid, setting_json_schema_invalid,
 * setting_scope_not_allowed, setting_secret_not_storable,
 * setting_owner_not_found, setting_override_not_supported,
 * setting_not_nullable.
 */
final class SettingValidationException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
