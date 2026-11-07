<?php

namespace App\Modules\Projects;

use App\Core\Authorization\AuthorizationException;
use App\Core\Authorization\AuthorizationService;
use App\Core\Authorization\WorkspaceContext;
use App\Core\Authorization\WorkspaceScope;
use App\Core\Memberships\MembershipStatus;
use App\Core\Modules\ModuleAccessGuard;
use App\Core\Modules\ModuleOperation;
use App\Core\Rbac\RbacValidationException;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\Project;
use App\Models\User;
use App\Modules\Projects\Services\ProjectScopeAccess;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Projects authorization adapter (Stage 04B; production entitlement
 * since C5-3): the single place where Projects HTTP requests are
 * mapped onto the central authorization decision. Controllers call
 * this and nothing else — no parallel authorization logic lives in
 * them. Scoped mode composes: central RBAC authorization (no module
 * gates), then the operation-aware ModuleAccessGuard (availability,
 * organization policy, workspace activation, subscription level).
 * VIEW maps to a safe Read; every other permission maps to Write,
 * so an expired (read-only) subscription can read but never mutate.
 * The Stage 04B pilot gates and their config were deleted in C5-3;
 * the scoped/legacy mode firewall documented in
 * docs/migration/04b-projects-access-path-inventory.md is unchanged.
 */
final class ProjectAuthorizer
{
    public const VIEW = 'projects.view';

    public const CREATE = 'projects.create';

    public const EDIT = 'projects.edit';

    public const DELETE = 'projects.delete';

    private readonly AuthorizationService $authorization;

    private readonly ModuleAccessGuard $moduleGuard;

    public function __construct(
        private readonly ProjectScopeAccess $legacyAccess,
        ?ModuleAccessGuard $moduleGuard = null,
        ?AuthorizationService $authorization = null,
    ) {
        // Production wiring (C5-3): the container-resolved central
        // authorization service (RBAC only — no module gates) plus
        // the operation-aware module access guard. The pilot gates
        // that stood in for entitlements until now are deleted.
        $this->moduleGuard = $moduleGuard ?? app(ModuleAccessGuard::class);
        $this->authorization = $authorization ?? app(AuthorizationService::class);
    }

    /**
     * The client-requested workspace context, if any. This is only a
     * request — never proof of authorization.
     */
    public function requestedWorkspaceId(Request $request): int|string|null
    {
        $header = $request->header('X-Workspace-Id');

        if (is_string($header) && $header !== '') {
            return $header;
        }

        $value = $request->input('workspace_id');

        return is_int($value) || (is_string($value) && $value !== '') ? $value : null;
    }

    public function isScopedRequest(Request $request, ?Project $project = null): bool
    {
        return $this->requestedWorkspaceId($request) !== null
            || ($project !== null && $project->workspace_id !== null);
    }

    /**
     * Authorize an operation bound to an existing project. Scoped mode
     * whenever the project is workspace-owned or a context was
     * requested; the fully legacy path otherwise.
     */
    public function authorizeProject(Request $request, Project $project, string $scopedPermission, string $legacyAssertion): ?WorkspaceContext
    {
        if (! $this->isScopedRequest($request, $project)) {
            match ($legacyAssertion) {
                'view' => $this->legacyAccess->assertView($request->user(), $project),
                'edit' => $this->legacyAccess->assertEdit($request->user(), $project),
                'delete' => $this->legacyAccess->assertArchive($request->user(), $project),
                default => abort(403),
            };

            return null;
        }

        if ($project->workspace_id === null) {
            // Requested a workspace context for a legacy-mode record:
            // indistinguishable from a foreign record.
            abort(404);
        }

        $requested = $this->requestedWorkspaceId($request);
        if ($requested !== null && (! is_numeric($requested) || (int) $requested !== (int) $project->workspace_id)) {
            abort(404);
        }

        $context = $this->authorize($request->user(), (int) $project->workspace_id, $scopedPermission);
        WorkspaceScope::assertRecordInContext($project, $context);

        return $context;
    }

    /**
     * Authorize a context-bound operation (list/create) in scoped
     * mode; returns null in legacy mode, where the caller applies the
     * unchanged legacy permission checks.
     */
    public function authorizeContext(Request $request, string $scopedPermission): ?WorkspaceContext
    {
        $requested = $this->requestedWorkspaceId($request);
        if ($requested === null) {
            return null;
        }

        return $this->authorize($request->user(), $requested, $scopedPermission);
    }

    /**
     * In scoped mode every project member and the project manager must
     * be active members of the project's workspace; cross-workspace
     * associations are rejected (422), never silently attached.
     *
     * @param  list<int>  $userIds
     */
    public function assertUsersAreWorkspaceMembers(WorkspaceContext $context, array $userIds, string $field): void
    {
        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if ($userIds === []) {
            return;
        }

        $activeMemberIds = WorkspaceMembership::where('workspace_id', $context->workspaceId())
            ->whereIn('user_id', $userIds)
            ->where('status', MembershipStatus::Active->value)
            ->pluck('user_id')
            ->map(fn ($id): int => (int) $id)
            ->all();

        if (array_diff($userIds, $activeMemberIds) !== []) {
            throw ValidationException::withMessages([
                $field => 'All project members must be active members of the project workspace.',
            ]);
        }
    }

    private function authorize(User $user, int|string $workspaceId, string $permission): WorkspaceContext
    {
        try {
            $context = $this->authorization->authorize($user, $workspaceId, $permission);
            $operation = $permission === self::VIEW ? ModuleOperation::Read : ModuleOperation::Write;
            $this->moduleGuard->assertOperational($context, ProjectsModule::ID, $operation);

            return $context;
        } catch (AuthorizationException $exception) {
            abort($exception->httpStatus(), $exception->getMessage());
        } catch (RbacValidationException $exception) {
            abort(422, $exception->getMessage());
        }
    }
}
