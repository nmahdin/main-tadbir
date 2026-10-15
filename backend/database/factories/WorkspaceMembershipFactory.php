<?php

namespace Database\Factories;

use App\Core\Memberships\MembershipStatus;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkspaceMembership>
 */
class WorkspaceMembershipFactory extends Factory
{
    protected $model = WorkspaceMembership::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'user_id' => User::factory(),
            'status' => MembershipStatus::Active,
        ];
    }

    public function configure(): static
    {
        // Live memberships hold the protected Member role by default so
        // factory-built state satisfies the Stage 03B role invariant;
        // ended memberships hold no role (rejoin assigns explicitly).
        return $this->afterCreating(function (WorkspaceMembership $membership): void {
            if ($membership->status !== MembershipStatus::Ended && $membership->role_id === null) {
                $role = app(RoleProvisioner::class)->workspaceMember($membership->workspace);
                $membership->forceFill(['role_id' => $role->id])->save();
            }
        });
    }

    public function deactivated(): static
    {
        return $this->state(fn (): array => [
            'status' => MembershipStatus::Deactivated,
            'deactivated_at' => now(),
        ]);
    }

    public function ended(): static
    {
        return $this->state(fn (): array => [
            'status' => MembershipStatus::Ended,
            'ended_at' => now(),
        ]);
    }
}
