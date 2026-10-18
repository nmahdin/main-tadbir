<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Organizations\Organization;
use App\Core\Settings\Services\ScopedSecretService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingRegistryException;
use App\Core\Settings\SettingsPayload;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValidationException;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Write-only secret configuration (Stage C7-4) over the C7-3
 * ScopedSecretService. Responses contain metadata ONLY
 * (configured / version / updated-at): there is no reveal,
 * download, export, or ciphertext representation anywhere in this
 * surface, request values are never echoed back (including in
 * errors), and listing is registry-driven — only keys a real
 * consumer registered as secret appear, each gated by the
 * dedicated separately-provisioned secrets permission inside the
 * service.
 */
class ScopedSettingsSecretsController extends Controller
{
    use SettingErrorResponses;

    public function __construct(
        private readonly ScopedSecretService $secrets,
        private readonly SettingsRegistry $registry,
    ) {}

    public function organizationIndex(Request $request, Organization $organization): JsonResponse
    {
        try {
            $items = [];
            foreach ($this->secretDefinitionsFor(SettingDefinition::SCOPE_ORGANIZATION) as $definition) {
                $items[] = [
                    'definition' => SettingsPayload::definition($definition),
                    'secret' => $this->secrets->organizationSecretMetadata($request->user(), $organization, $definition->key),
                ];
            }
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => $items]);
    }

    public function organizationPut(Request $request, Organization $organization, string $key): JsonResponse
    {
        [$value, $expected] = $this->secretInput($request);
        if ($value instanceof JsonResponse) {
            return $value;
        }

        try {
            $metadata = $this->secrets->putOrganizationSecret($request->user(), $organization, $key, $value, $expected);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'secret' => $metadata]]);
    }

    public function organizationRevoke(Request $request, Organization $organization, string $key): JsonResponse
    {
        try {
            $this->secrets->revokeOrganizationSecret($request->user(), $organization, $key, $this->expectedVersion($request));
            $metadata = $this->secrets->organizationSecretMetadata($request->user(), $organization, $key);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'secret' => $metadata]]);
    }

    public function workspaceIndex(Request $request, Workspace $workspace): JsonResponse
    {
        try {
            $items = [];
            foreach ($this->secretDefinitionsFor(SettingDefinition::SCOPE_WORKSPACE) as $definition) {
                $items[] = [
                    'definition' => SettingsPayload::definition($definition),
                    'secret' => $this->secrets->workspaceSecretMetadata($request->user(), $workspace, $definition->key),
                ];
            }
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => $items]);
    }

    public function workspacePut(Request $request, Workspace $workspace, string $key): JsonResponse
    {
        [$value, $expected] = $this->secretInput($request);
        if ($value instanceof JsonResponse) {
            return $value;
        }

        try {
            $metadata = $this->secrets->putWorkspaceSecret($request->user(), $workspace, $key, $value, $expected);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'secret' => $metadata]]);
    }

    public function workspaceRevoke(Request $request, Workspace $workspace, string $key): JsonResponse
    {
        try {
            $this->secrets->revokeWorkspaceSecret($request->user(), $workspace, $key, $this->expectedVersion($request));
            $metadata = $this->secrets->workspaceSecretMetadata($request->user(), $workspace, $key);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'secret' => $metadata]]);
    }

    // -- Helpers -----------------------------------------------------

    /**
     * @return list<SettingDefinition>
     */
    private function secretDefinitionsFor(string $scope): array
    {
        return array_values(array_filter(
            $this->registry->all(),
            fn (SettingDefinition $definition): bool => $definition->sensitivity === SettingDefinition::SENSITIVITY_SECRET
                && in_array($scope, $definition->allowedScopes, true),
        ));
    }

    /**
     * The plaintext is read exactly once, handed to the service,
     * and never reflected in any response or error body.
     *
     * @return array{0: string|JsonResponse, 1: int|null}
     */
    private function secretInput(Request $request): array
    {
        if (! $request->has('value') || ! is_string($request->input('value'))) {
            return [response()->json(['message' => 'A secret value is required.', 'code' => 'setting_secret_value_required'], 422), null];
        }

        return [$request->input('value'), $this->expectedVersion($request)];
    }

    private function expectedVersion(Request $request): ?int
    {
        $validated = $request->validate([
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        return isset($validated['expected_version']) ? (int) $validated['expected_version'] : null;
    }
}
