<?php

namespace App\Core\Settings;

use RuntimeException;

/**
 * Stable authorized-mutation failure codes (Stage C7-2):
 * setting_forbidden, setting_organization_unavailable,
 * setting_version_conflict, setting_override_denied,
 * setting_module_disabled, setting_module_unavailable.
 *
 * (Registration/validation failures keep the C7-1
 * SettingRegistryException / SettingValidationException codes.)
 */
final class SettingServiceException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
