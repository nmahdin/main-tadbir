<?php

namespace App\Core\Workspaces;

use App\Core\Memberships\MembershipStatus;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Ensures the one default personal workspace per user (ADR-0002).
 *
 * Idempotent and duplicate-safe: a concurrent creator losing the race
 * against the unique generated-column index gets the winner's workspace
 * back instead of an error.
 */
final class PersonalWorkspaceProvisioner
{
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
            return DB::transaction(function () use ($user): Workspace {
                $workspace = Workspace::create([
                    'name' => $user->name,
                    'owner_user_id' => $user->id,
                    'is_default' => true,
                    'status' => 'active',
                ]);

                WorkspaceMembership::create([
                    'workspace_id' => $workspace->id,
                    'user_id' => $user->id,
                    'status' => MembershipStatus::Active,
                ]);

                return $workspace;
            });
        } catch (QueryException) {
            return Workspace::personal()
                ->where('owner_user_id', $user->id)
                ->where('is_default', true)
                ->firstOrFail();
        }
    }
}
