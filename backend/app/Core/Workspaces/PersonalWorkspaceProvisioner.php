<?php

namespace App\Core\Workspaces;

use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Ensures the one default personal workspace per user (ADR-0002) and
 * creates additional personal workspaces. The owner always receives an
 * explicit workspace membership carrying the protected Workspace
 * Manager role (Stage 03B) in the same transaction.
 *
 * Idempotent and duplicate-safe: a concurrent creator losing the race
 * against the unique generated-column index gets the winner's workspace
 * back instead of an error.
 */
final class PersonalWorkspaceProvisioner
{
    public function __construct(
        private readonly RoleProvisioner $roles,
        private readonly WorkspaceRoleService $workspaceRoles,
    ) {}

    public function ensureDefault(User $user): Workspace
    {
        $existing = Workspace::personal()
            ->where('owner_user_id', $user->id)
            ->where('is_default', true)
            ->first();

        if ($existing) {
            return $existing;
        }

        try {
            return $this->createOwnedWorkspace($user, $user->name, isDefault: true);
        } catch (QueryException) {
            return Workspace::personal()
                ->where('owner_user_id', $user->id)
                ->where('is_default', true)
                ->firstOrFail();
        }
    }

    public function createAdditional(User $user, string $name): Workspace
    {
        return $this->createOwnedWorkspace($user, $name, isDefault: false);
    }

    private function createOwnedWorkspace(User $user, string $name, bool $isDefault): Workspace
    {
        return DB::transaction(function () use ($user, $name, $isDefault): Workspace {
            $workspace = Workspace::create([
                'name' => $name,
                'owner_user_id' => $user->id,
                'is_default' => $isDefault,
                'status' => 'active',
            ]);

            $roles = $this->roles->ensureForWorkspace($workspace);
            $membership = WorkspaceMembership::create([
                'workspace_id' => $workspace->id,
                'user_id' => $user->id,
                'status' => MembershipStatus::Active,
            ]);
            $this->workspaceRoles->assignSystemRole($membership, $roles['manager']);

            return $workspace;
        });
    }
}
