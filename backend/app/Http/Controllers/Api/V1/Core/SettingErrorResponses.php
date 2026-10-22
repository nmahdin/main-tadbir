<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Settings\SettingRegistryException;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValidationException;
use Illuminate\Http\JsonResponse;

/**
 * Stable domain-code → HTTP mapping for the scoped-settings API
 * (Stage C7-4). Responses carry only the stable code and the
 * service message; service messages never contain setting values,
 * plaintext, ciphertext, or provider details.
 */
trait SettingErrorResponses
{
    private function settingError(SettingServiceException|SettingValidationException|SettingRegistryException $exception): JsonResponse
    {
        $status = match (true) {
            $exception instanceof SettingValidationException => 422,
            $exception instanceof SettingRegistryException => $exception->errorCode === 'setting_not_found' ? 404 : 422,
            default => match ($exception->errorCode) {
                'setting_forbidden' => 403,
                'setting_revision_not_found', 'setting_history_unavailable' => 404,
                'setting_version_conflict', 'setting_override_denied',
                'setting_organization_unavailable', 'setting_workspace_unavailable',
                'setting_module_disabled', 'setting_module_unavailable' => 409,
                'setting_secret_encryption_unavailable' => 503,
                default => 422,
            },
        };

        return response()->json([
            'message' => $exception->getMessage(),
            'code' => $exception->errorCode,
        ], $status);
    }
}
