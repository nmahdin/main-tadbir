<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Organizations\Organization;
use App\Core\Settings\ScopedSettingService;
use App\Core\Settings\SettingDefinition;
use App\Core\Settings\SettingRegistryException;
use App\Core\Settings\SettingsPayload;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValidationException;
use App\Core\Settings\SettingValueStore;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Scoped-settings HTTP surface (Stage C7-4).
 *
 * Thin adapter over the C7-2 ScopedSettingService: every read is
 * authorized inside the service from persisted memberships and
 * every mutation is the service's authorized, version-checked,
 * audited write. Scope always comes from the route's persisted
 * Organization/Workspace model — there is no generic owner-type /
 * owner-id input anywhere. Secret definitions are never listed
 * here (see ScopedSettingsSecretsController); explicit stored
 * state is composed from the value store only AFTER the service
 * has authorized the read for that scope.
 */
class ScopedSettingsController extends Controller
{
    use SettingErrorResponses;

    public function __construct(
        private readonly ScopedSettingService $settings,
        private readonly SettingsRegistry $registry,
        private readonly SettingValueStore $store,
    ) {}

    // -- Organization scope ----------------------------------------

    public function organizationIndex(Request $request, Organization $organization): JsonResponse
    {
        try {
            $items = [];
            foreach ($this->definitionsFor(SettingDefinition::SCOPE_ORGANIZATION) as $definition) {
                $effective = $this->settings->effectiveFor($request->user(), $definition->key, $organization);
                $item = [
                    'definition' => SettingsPayload::definition($definition),
                    'effective' => SettingsPayload::effective($effective),
                    'explicit' => SettingsPayload::explicit($this->store->get('organization', (int) $organization->id, $definition->key)),
                    'override_policy' => null,
                ];
                if ($definition->workspaceOverride) {
                    $item['override_policy'] = $this->settings->overridePolicyFor($request->user(), $organization, $definition->key);
                }
                $items[] = $item;
            }
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => $items]);
    }

    public function organizationWrite(Request $request, Organization $organization, string $key): JsonResponse
    {
        if (! $request->has('value')) {
            return response()->json(['message' => 'A value (possibly null) is required.', 'code' => 'setting_value_required'], 422);
        }
        $expected = $this->expectedVersion($request);

        try {
            $stored = $this->settings->writeOrganizationValue($request->user(), $organization, $key, $request->input('value'), $expected);
            $effective = $this->settings->effectiveFor($request->user(), $key, $organization);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => [
            'key' => $key,
            'explicit' => SettingsPayload::explicit($stored),
            'effective' => SettingsPayload::effective($effective),
        ]]);
    }

    public function organizationRemove(Request $request, Organization $organization, string $key): JsonResponse
    {
        $expected = $this->expectedVersion($request);

        try {
            $this->settings->removeOrganizationValue($request->user(), $organization, $key, $expected);
            $effective = $this->settings->effectiveFor($request->user(), $key, $organization);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => [
            'key' => $key,
            'explicit' => SettingsPayload::explicit($this->store->get('organization', (int) $organization->id, $key)),
            'effective' => SettingsPayload::effective($effective),
        ]]);
    }

    public function organizationPolicy(Request $request, Organization $organization, string $key): JsonResponse
    {
        $validated = $request->validate([
            'allow' => ['required', 'boolean'],
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        try {
            $policy = $this->settings->setOverridePolicy(
                $request->user(),
                $organization,
                $key,
                (bool) $validated['allow'],
                isset($validated['expected_version']) ? (int) $validated['expected_version'] : null,
            );
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'override_policy' => $policy]]);
    }

    // -- Workspace scope -------------------------------------------

    public function workspaceIndex(Request $request, Workspace $workspace): JsonResponse
    {
        try {
            $items = [];
            foreach ($this->definitionsFor(SettingDefinition::SCOPE_WORKSPACE) as $definition) {
                $effective = $this->settings->effectiveFor($request->user(), $definition->key, workspace: $workspace);
                $item = [
                    'definition' => SettingsPayload::definition($definition),
                    'effective' => SettingsPayload::effective($effective),
                    'explicit' => SettingsPayload::explicit($this->store->get('workspace', (int) $workspace->id, $definition->key)),
                    'override_policy' => $this->workspaceOverridePolicy($workspace, $definition),
                ];
                $items[] = $item;
            }
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => $items]);
    }

    public function workspaceWrite(Request $request, Workspace $workspace, string $key): JsonResponse
    {
        if (! $request->has('value')) {
            return response()->json(['message' => 'A value (possibly null) is required.', 'code' => 'setting_value_required'], 422);
        }
        $expected = $this->expectedVersion($request);

        try {
            $stored = $this->settings->writeWorkspaceValue($request->user(), $workspace, $key, $request->input('value'), $expected);
            $effective = $this->settings->effectiveFor($request->user(), $key, workspace: $workspace);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => [
            'key' => $key,
            'explicit' => SettingsPayload::explicit($stored),
            'effective' => SettingsPayload::effective($effective),
        ]]);
    }

    public function workspaceRemove(Request $request, Workspace $workspace, string $key): JsonResponse
    {
        $expected = $this->expectedVersion($request);

        try {
            $this->settings->removeWorkspaceValue($request->user(), $workspace, $key, $expected);
            $effective = $this->settings->effectiveFor($request->user(), $key, workspace: $workspace);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => [
            'key' => $key,
            'explicit' => SettingsPayload::explicit($this->store->get('workspace', (int) $workspace->id, $key)),
            'effective' => SettingsPayload::effective($effective),
        ]]);
    }

    // -- User preferences ------------------------------------------

    public function preferenceIndex(Request $request): JsonResponse
    {
        try {
            $items = [];
            foreach ($this->registry->all() as $definition) {
                if (! $definition->userOverride || $definition->sensitivity === SettingDefinition::SENSITIVITY_SECRET) {
                    continue;
                }
                $effective = $this->settings->preferenceFor($request->user(), $definition->key);
                $items[] = [
                    'definition' => SettingsPayload::definition($definition),
                    'effective' => SettingsPayload::effective($effective),
                    'explicit' => SettingsPayload::explicit($this->store->get('user', (int) $request->user()->id, $definition->key)),
                    'override_policy' => null,
                ];
            }
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => $items]);
    }

    public function preferenceWrite(Request $request, string $key): JsonResponse
    {
        if (! $request->has('value')) {
            return response()->json(['message' => 'A value (possibly null) is required.', 'code' => 'setting_value_required'], 422);
        }
        $expected = $this->expectedVersion($request);

        try {
            $stored = $this->settings->writeUserPreference($request->user(), $key, $request->input('value'), $expected);
            $effective = $this->settings->preferenceFor($request->user(), $key);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => [
            'key' => $key,
            'explicit' => SettingsPayload::explicit($stored),
            'effective' => SettingsPayload::effective($effective),
        ]]);
    }

    public function preferenceRemove(Request $request, string $key): JsonResponse
    {
        $expected = $this->expectedVersion($request);

        try {
            $this->settings->removeUserPreference($request->user(), $key, $expected);
            $effective = $this->settings->preferenceFor($request->user(), $key);
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => [
            'key' => $key,
            'explicit' => SettingsPayload::explicit($this->store->get('user', (int) $request->user()->id, $key)),
            'effective' => SettingsPayload::effective($effective),
        ]]);
    }

    // -- Helpers -----------------------------------------------------

    /**
     * Non-secret definitions eligible for one scope. Only Core
     * definitions are registered today; module-owned definitions
     * join automatically when a module registers them (their write
     * path stays module-gated inside the service).
     *
     * @return list<SettingDefinition>
     */
    private function definitionsFor(string $scope): array
    {
        return array_values(array_filter(
            $this->registry->all(),
            fn (SettingDefinition $definition): bool => $definition->sensitivity !== SettingDefinition::SENSITIVITY_SECRET
                && in_array($scope, $definition->allowedScopes, true),
        ));
    }

    /**
     * Workspace-override policy display state. Read from the store
     * only after effectiveFor() authorized this actor for the
     * Workspace scope; the boolean policy state is not a setting
     * value. Personal Workspaces fall back to the definition
     * default, matching resolver semantics.
     *
     * @return array{allow: bool, version: int|null, explicit: bool}|null
     */
    private function workspaceOverridePolicy(Workspace $workspace, SettingDefinition $definition): ?array
    {
        if (! $definition->workspaceOverride) {
            return null;
        }
        if ($workspace->organization_id === null) {
            return ['allow' => $definition->workspaceOverrideDefault, 'version' => null, 'explicit' => false];
        }

        return $this->store->policyDecision((int) $workspace->organization_id, $definition->key);
    }

    private function expectedVersion(Request $request): ?int
    {
        $validated = $request->validate([
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        return isset($validated['expected_version']) ? (int) $validated['expected_version'] : null;
    }
}
