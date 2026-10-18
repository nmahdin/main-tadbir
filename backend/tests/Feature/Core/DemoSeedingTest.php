<?php

namespace Tests\Feature\Core;

use App\Core\Invitations\CoreInvitation;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Plans\CorePlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * ARCH-01 — essential/demo seeding contracts: essential data is
 * idempotent and creates no accounts or grants; demo data is
 * deterministic, DEMO-marked, idempotent, and fails closed
 * outside local/testing.
 */
class DemoSeedingTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    public function test_essential_seeding_is_idempotent_and_creates_no_accounts(): void
    {
        $this->artisan('tadbir:seed-essential')->assertExitCode(0);
        $permissionsAfterFirst = DB::table('core_permissions')->count();
        $this->assertGreaterThan(0, $permissionsAfterFirst);
        $this->assertSame(0, User::query()->count(), 'essential seeding creates no accounts');
        $this->assertSame(0, Organization::query()->count(), 'essential seeding creates no organizations');

        $this->artisan('tadbir:seed-essential')->assertExitCode(0);
        $this->assertSame($permissionsAfterFirst, DB::table('core_permissions')->count(), 'rerun changes nothing');
        $this->assertSame(0, User::query()->count());
    }

    public function test_demo_seeding_builds_a_safe_idempotent_scenario(): void
    {
        $this->artisan('tadbir:seed-demo')->assertExitCode(0);

        $owner = User::query()->where('username', 'demo-owner')->firstOrFail();
        $this->assertSame('active', $owner->status);
        $organization = Organization::query()->where('slug', 'demo-organization')->firstOrFail();
        $this->assertStringStartsWith('DEMO', $organization->name);
        $this->assertTrue(
            OrganizationMembership::query()->where('organization_id', $organization->id)->where('user_id', User::query()->where('username', 'demo-member')->value('id'))->exists(),
            'demo member holds a real membership',
        );
        $this->assertTrue(CorePlan::query()->where('key', 'demo-plan')->exists());
        $this->assertTrue(
            CoreInvitation::query()->where('organization_id', $organization->id)->where('email_normalized', 'demo-invitee@example.test')->exists(),
            'one pending demo invitation exists',
        );

        $counts = [
            User::query()->count(),
            Organization::query()->count(),
            CoreInvitation::query()->count(),
            CorePlan::query()->count(),
        ];

        // Safe repeated invocation: nothing duplicates.
        $this->artisan('tadbir:seed-demo')->assertExitCode(0);
        $this->assertSame($counts, [
            User::query()->count(),
            Organization::query()->count(),
            CoreInvitation::query()->count(),
            CorePlan::query()->count(),
        ]);
    }

    public function test_demo_seeding_fails_closed_in_production(): void
    {
        $this->app->instance('env', 'production');

        $this->artisan('tadbir:seed-demo')->assertExitCode(1);
        $this->assertSame(0, User::query()->where('username', 'demo-owner')->count(), 'no demo data may be created in production');
    }
}
