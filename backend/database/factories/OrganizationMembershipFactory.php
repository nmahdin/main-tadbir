<?php

namespace Database\Factories;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Rbac\RoleProvisioner;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OrganizationMembership>
 */
class OrganizationMembershipFactory extends Factory
{
    protected $model = OrganizationMembership::class;

    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'user_id' => User::factory(),
            'status' => MembershipStatus::Active,
        ];
    }

    public function configure(): static
    {
        // See WorkspaceMembershipFactory: live memberships default to
        // the protected Organization Member role; ended ones hold none.
        return $this->afterCreating(function (OrganizationMembership $membership): void {
            if ($membership->status !== MembershipStatus::Ended && $membership->role_id === null) {
                $role = app(RoleProvisioner::class)->organizationMember($membership->organization);
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
