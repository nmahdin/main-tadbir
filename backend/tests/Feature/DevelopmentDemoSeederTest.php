<?php

namespace Tests\Feature;

use App\Core\Organizations\Organization;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Database\Seeders\DevelopmentDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Tests\TestCase;

/**
 * Development demo seeder contract: local/testing only, env-only
 * credentials, idempotent, tenant-isolated, and visible through the
 * real environment-discovery API.
 */
class DevelopmentDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'demo_seed.platform_password' => 'Demo-Platform-1',
            'demo_seed.personal_password' => 'Demo-Personal-1',
            'demo_seed.org_owner_password' => 'Demo-Owner-1',
            'demo_seed.org_member_password' => 'Demo-Member-1',
            'demo_seed.org_member2_password' => 'Demo-Member-2',
        ]);
    }

    public function test_demo_seed_builds_three_shells_with_free_subscriptions(): void
    {
        $this->seed(DevelopmentDemoSeeder::class);

        foreach (['demo.platform', 'demo.personal', 'demo.owner', 'demo.member', 'demo.member2'] as $username) {
            $this->assertTrue(User::where('username', $username)->exists(), $username);
        }

        // Personal Free is active for the ordinary personal user.
        $personal = User::where('username', 'demo.personal')->firstOrFail();
        $workspace = Workspace::where('owner_user_id', $personal->id)->firstOrFail();
        $this->assertTrue($workspace->isPersonal());
        $this->assertSame(1, CoreSubscription::where('personal_workspace_id', $workspace->id)->count());

        // Organization with Organization Free and exactly 3 members.
        $organization = Organization::where('slug', 'demo-org')->firstOrFail();
        $this->assertSame(1, CoreSubscription::where('organization_id', $organization->id)->count());
        $this->assertSame(3, $organization->memberships()->where('status', 'active')->count());

        // Representative records within the Free quotas.
        $this->assertSame(3, Project::where('workspace_id', $workspace->id)->count());
        $this->assertSame(2, Project::where('workspace_id', $workspace->id)->whereNotIn('status', ['completed', 'cancelled', 'archived'])->count());
        $this->assertGreaterThanOrEqual(9, Task::where('workspace_id', $workspace->id)->count());
        $this->assertSame(2, DomainRecord::where('domain', 'notification')->where('user_id', $personal->id)->count());
        $this->assertSame(1, DomainRecord::where('domain', 'notification')->where('user_id', $personal->id)->whereNull('read_at')->count());
    }

    public function test_demo_seed_is_idempotent_and_never_overwrites_credentials(): void
    {
        $this->seed(DevelopmentDemoSeeder::class);

        $personal = User::where('username', 'demo.personal')->firstOrFail();
        $personal->forceFill(['password' => Hash::make('Changed-By-Owner-1')])->save();
        $counts = [
            User::count(), Organization::count(), CoreSubscription::count(), Project::count(), Task::count(),
            DomainRecord::where('domain', 'notification')->count(),
        ];

        $this->seed(DevelopmentDemoSeeder::class);

        $this->assertSame($counts, [
            User::count(), Organization::count(), CoreSubscription::count(), Project::count(), Task::count(),
            DomainRecord::where('domain', 'notification')->count(),
        ]);
        $this->assertTrue(Hash::check('Changed-By-Owner-1', $personal->fresh()->password));
    }

    public function test_demo_visibility_and_tenant_isolation_via_environments_api(): void
    {
        $this->seed(DevelopmentDemoSeeder::class);

        // Platform shell for the platform administrator.
        $platform = User::where('username', 'demo.platform')->firstOrFail();
        $platformResponse = $this->actingAs($platform)->getJson('/api/v1/core/environments')->assertOk();
        $platformResponse->assertJsonPath('data.platform.eligible', true);
        $platformResponse->assertJsonPath('data.platform.is_primary', true);

        // The personal user's /select-environment data contains their
        // personal workspace and no organization workspace (isolation).
        $personal = User::where('username', 'demo.personal')->firstOrFail();
        $personalResponse = $this->actingAs($personal)->getJson('/api/v1/core/environments')->assertOk();
        $personalResponse->assertJsonPath('data.platform.eligible', false);
        $this->assertSame([], $personalResponse->json('data.organizations'));
        $this->assertNotSame([], $personalResponse->json('data.workspaces'));
        $this->assertTrue(collect($personalResponse->json('data.workspaces'))->every(fn ($w) => $w['organization_id'] === null));

        // Organization member sees the organization; the org-only
        // member has no workspace membership in it.
        $member2 = User::where('username', 'demo.member2')->firstOrFail();
        $memberResponse = $this->actingAs($member2)->getJson('/api/v1/core/environments')->assertOk();
        $this->assertNotSame([], $memberResponse->json('data.organizations'));
        $organization = Organization::where('slug', 'demo-org')->firstOrFail();
        $orgWorkspaceIds = $organization->workspaces()->pluck('id')->all();
        $this->assertSame(0, WorkspaceMembership::where('user_id', $member2->id)->whereIn('workspace_id', $orgWorkspaceIds)->count());
    }

    public function test_demo_seed_requires_configured_credentials(): void
    {
        config(['demo_seed.personal_password' => null]);

        try {
            $this->seed(DevelopmentDemoSeeder::class);
            $this->fail('missing demo credentials must abort the seed');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('DEMO_PERSONAL_PASSWORD', $exception->getMessage());
        }

        $this->assertSame(0, User::where('username', 'demo.personal')->count());
    }

    public function test_demo_seed_refuses_production(): void
    {
        $this->app->instance('env', 'production');

        try {
            $this->seed(DevelopmentDemoSeeder::class);
            $this->fail('demo seed must refuse production');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('production', $exception->getMessage());
        } finally {
            $this->app->instance('env', 'testing');
        }

        $this->assertSame(0, User::where('username', 'demo.personal')->count());
    }
}
