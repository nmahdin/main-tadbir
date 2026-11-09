<?php

namespace App\Http\Controllers\Api\V1\Core;

use App\Core\Authorization\AuthorizationDeniedException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Modules\ModuleActivationException;
use App\Core\Modules\ModuleActivationPlanner;
use App\Core\Modules\ModuleActivationPreview;
use App\Core\Modules\ModuleCatalog;
use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Modules\WorkspaceModuleService;
use App\Core\Workspaces\Workspace;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Thin HTTP layer over the Stage C4-2 module services.
 *
 * This controller contains NO activation, dependency, policy, or
 * entitlement logic: listing and previews come from
 * ModuleActivationPlanner (read-only), activation/deactivation from
 * WorkspaceModuleService (the single transactional engine, which
 * re-authorizes and re-validates everything inside its locks).
 * Error bodies are flat {message, code} with the stable C4-2 domain
 * codes; `module_unknown` maps to 404 at this HTTP boundary.
 */
final class WorkspaceModuleController extends Controller
{
    public function __construct(
        private readonly AuthorizationService $authorization,
        private readonly ModuleActivationPlanner $planner,
        private readonly ModuleDependencyResolver $resolver,
        private readonly WorkspaceModuleService $modules,
    ) {}

    /**
     * Every registered business module with its per-workspace
     * state. Read authorization: `workspace.view` via central
     * authorization (active account/workspace/memberships; a
     * suspended or ended organization is denied by context
     * resolution). Unimplemented modules are reported with
     * available=false — never as operationally available.
     */
    public function index(Request $request, Workspace $workspace): JsonResponse
    {
        try {
            $this->authorization->authorize($request->user(), $workspace->id, 'workspace.view');
        } catch (AuthorizationDeniedException $exception) {
            return $this->denied($exception);
        }

        $enabled = $this->planner->enabledModuleKeys($workspace);

        $data = [];
        foreach (ModuleCatalog::definitions() as $definition) {
            $preview = $this->planner->preview($workspace, $definition->key);
            $data[] = [
                'key' => $definition->key,
                'name' => $definition->name,
                'available' => $definition->isAvailable(),
                'state' => in_array($definition->key, $enabled, true) ? 'enabled' : 'disabled',
                'dependencies' => $this->resolver->directPrerequisites($definition->key),
                'prerequisites' => $preview->prerequisites,
                'eligible' => $preview->confirmable(),
                'blocking_reasons' => $preview->blockingReasons,
            ];
        }

        return response()->json(['data' => $data]);
    }

    /**
     * Dependency-aware activation preview. Requires
     * `workspace.modules.manage`; mutates nothing.
     */
    public function preview(Request $request, Workspace $workspace, string $module): JsonResponse
    {
        try {
            $this->authorization->authorize($request->user(), $workspace->id, WorkspaceModuleService::PERMISSION);
            $preview = $this->planner->preview($workspace, $module);
        } catch (AuthorizationDeniedException $exception) {
            return $this->denied($exception);
        } catch (ModuleActivationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => $this->presentPreview($preview)]);
    }

    /**
     * Confirm a preview. The token is passed verbatim to the atomic
     * activation service, which revalidates authorization,
     * lifecycle, registry, availability, policy, activation state,
     * and entitlement inside its transaction. Client-supplied
     * dependency lists or states are never read.
     */
    public function activate(Request $request, Workspace $workspace, string $module): JsonResponse
    {
        $data = $request->validate([
            'confirmation_token' => ['required', 'string'],
        ]);

        try {
            $enabled = $this->modules->activate($request->user(), $workspace, $module, $data['confirmation_token']);
        } catch (AuthorizationDeniedException $exception) {
            return $this->denied($exception);
        } catch (ModuleActivationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => [
            'module' => $module,
            'state' => 'enabled',
            'newly_enabled' => $enabled,
        ]]);
    }

    /**
     * Safe deactivation: the service refuses while any active
     * dependent requires the module; nothing is cascade-disabled
     * and no business data is deleted.
     */
    public function deactivate(Request $request, Workspace $workspace, string $module): JsonResponse
    {
        try {
            $this->modules->deactivate($request->user(), $workspace, $module);
        } catch (AuthorizationDeniedException $exception) {
            return $this->denied($exception);
        } catch (ModuleActivationException $exception) {
            return $this->domainError($exception);
        }

        return response()->json(['data' => [
            'module' => $module,
            'state' => 'disabled',
        ]]);
    }

    private function presentPreview(ModuleActivationPreview $preview): array
    {
        return [
            'module' => $preview->moduleKey,
            'workspace_id' => $preview->workspaceId,
            'prerequisites' => $preview->prerequisites,
            'activation_order' => $preview->toEnable,
            'already_enabled' => $preview->alreadyEnabled,
            'to_enable' => $preview->toEnable,
            'availability' => $preview->availability,
            'organization_policy' => $preview->organizationPolicies,
            'entitlements' => $preview->entitlements,
            'blocking_reasons' => $preview->blockingReasons,
            'confirmable' => $preview->confirmable(),
            'confirmation_token' => $preview->confirmationToken,
        ];
    }

    private function denied(AuthorizationDeniedException $exception): JsonResponse
    {
        return response()->json([
            'message' => $exception->getMessage(),
            'code' => $exception->reason(),
        ], $exception->httpStatus());
    }

    private function domainError(ModuleActivationException $exception): JsonResponse
    {
        $status = $exception->errorCode === 'module_unknown' ? 404 : $exception->httpStatus;

        $body = [
            'message' => $exception->getMessage(),
            'code' => $exception->errorCode,
        ];

        if ($exception->dependents !== []) {
            $body['dependents'] = $exception->dependents;
        }

        return response()->json($body, $status);
    }
}
