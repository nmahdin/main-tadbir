<?php

namespace App\Core\Organizations;

use App\Core\Memberships\MembershipStatus;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Creates an organization atomically (ADR-0002): the organization, its one
 * default organizational workspace, the creator's organization membership
 * and the creator's EXPLICIT workspace membership on that default
 * workspace. Later organization members receive no workspace membership
 * implicitly (ADR-0003).
 */
final class OrganizationProvisioner
{
    public function create(User $creator, string $name, ?string $slug = null): Organization
    {
        return DB::transaction(function () use ($creator, $name, $slug): Organization {
            $organization = Organization::create([
                'name' => $name,
                'slug' => $slug ?? $this->uniqueSlug($name),
                'status' => 'active',
                'created_by' => $creator->id,
            ]);

            $workspace = Workspace::create([
                'name' => $name,
                'organization_id' => $organization->id,
                'is_default' => true,
                'status' => 'active',
            ]);

            OrganizationMembership::create([
                'organization_id' => $organization->id,
                'user_id' => $creator->id,
                'status' => MembershipStatus::Active,
            ]);

            WorkspaceMembership::create([
                'workspace_id' => $workspace->id,
                'user_id' => $creator->id,
                'status' => MembershipStatus::Active,
            ]);

            return $organization;
        });
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'organization';
        $slug = $base;
        $suffix = 2;

        while (Organization::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
