<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Organizations\Organization;
use App\Core\Settings\ScopedSettingService;
use App\Core\Settings\SettingRegistryException;
use App\Core\Settings\SettingsPayload;
use App\Core\Settings\SettingServiceException;
use App\Core\Settings\SettingValidationException;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Non-secret revision history + restore (Stage C7-4) over the
 * C7-3 ScopedSettingService contracts. History is metadata plus
 * non-secret values only — the service itself refuses secret keys
 * — and restore is a NEW versioned mutation revalidated against
 * current rules inside the service; it never decrypts, copies, or
 * otherwise touches secret material.
 */
class ScopedSettingsHistoryController extends Controller
{
    use SettingErrorResponses;

    public function __construct(
        private readonly ScopedSettingService $settings,
    ) {}

    public function organizationHistory(Request $request, Organization $organization, string $key): JsonResponse
    {
        return $this->history($request, fn () => $this->settings->revisionsFor($request->user(), $key, $organization));
    }

    public function workspaceHistory(Request $request, Workspace $workspace, string $key): JsonResponse
    {
        return $this->history($request, fn () => $this->settings->revisionsFor($request->user(), $key, workspace: $workspace));
    }

    public function preferenceHistory(Request $request, string $key): JsonResponse
    {
        return $this->history($request, fn () => $this->settings->revisionsFor($request->user(), $key));
    }

    public function organizationRestore(Request $request, Organization $organization, string $key, int $revision): JsonResponse
    {
        try {
            $stored = $this->settings->restoreOrganizationValue($request->user(), $organization, $key, $revision, $this->expectedVersion($request));
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'explicit' => SettingsPayload::explicit($stored)]]);
    }

    public function workspaceRestore(Request $request, Workspace $workspace, string $key, int $revision): JsonResponse
    {
        try {
            $stored = $this->settings->restoreWorkspaceValue($request->user(), $workspace, $key, $revision, $this->expectedVersion($request));
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'explicit' => SettingsPayload::explicit($stored)]]);
    }

    public function preferenceRestore(Request $request, string $key, int $revision): JsonResponse
    {
        try {
            $stored = $this->settings->restoreUserPreference($request->user(), $key, $revision, $this->expectedVersion($request));
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        return response()->json(['data' => ['key' => $key, 'explicit' => SettingsPayload::explicit($stored)]]);
    }

    /**
     * @param  callable(): list<array<string, mixed>>  $load
     */
    private function history(Request $request, callable $load): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);

        try {
            $revisions = $load();
        } catch (SettingServiceException|SettingValidationException|SettingRegistryException $exception) {
            return $this->settingError($exception);
        }

        $total = count($revisions);
        $items = array_map(
            fn (array $revision): array => SettingsPayload::revision($revision),
            array_slice($revisions, ($page - 1) * $perPage, $perPage),
        );

        return response()->json([
            'data' => $items,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ]);
    }

    private function expectedVersion(Request $request): ?int
    {
        $validated = $request->validate([
            'expected_version' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        return isset($validated['expected_version']) ? (int) $validated['expected_version'] : null;
    }
}
