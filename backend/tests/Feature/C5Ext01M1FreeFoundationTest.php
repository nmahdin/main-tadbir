<?php

namespace Tests\Feature;

use App\Core\Identity\AccountActivationService;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Plans\CorePlan;
use App\Core\Plans\PlanProvisioner;
use App\Core\Subscriptions\CoreResourceUsageReader;
use App\Core\Subscriptions\CoreSubscription;
use App\Core\Subscriptions\FreeActivationPending;
use App\Core\Subscriptions\FreePlanActivator;
use App\Core\Subscriptions\ResourceLimitGuard;
use App\Core\Subscriptions\SubscriptionException;
use App\Core\Subscriptions\SubscriptionOwner;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\Project;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * C5-EXT-01 M1 — Free-plan foundation (ADR-0022): canonical Free
 * publication, system-only activation, AUTH pending resume,
 * automatic Organization Free (AMB-C5-03=B), and quota enforcement.
 */
class C5Ext01M1FreeFoundationTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function publishFree(): void
    {
        Artisan::call('plans:provision-free');
    }

    private function personalUserWithWorkspace(): array
    {
        $user = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($user);

        return [$user, $workspace];
    }

    public function test_provision_free_publishes_canonical_limits_idempotently(): void
    {
        $this->publishFree();
        $this->publishFree(); // idempotent no-op

        $plans = app(PlanProvisioner::class);
        $personal = $plans->snapshot('personal-free', 1);
        $this->assertSame(1, $personal->limits['workspaces']['limit_value']);
        $this->assertSame(1, $personal->limits['workspace_members']['limit_value']);
        $this->assertSame(3, $personal->limits['projects']['limit_value']);
        $this->assertSame(104857600, $personal->limits['storage_bytes']['limit_value']);

        $organization = $plans->snapshot('organization-free', 1);
        $this->assertSame(1, $organization->limits['workspaces']['limit_value']);
        $this->assertSame(3, $organization->limits['organization_members']['limit_value']);
        $this->assertSame(3, $organization->limits['workspace_members']['limit_value']);
        $this->assertSame(5, $organization->limits['projects']['limit_value']);
        $this->assertSame(104857600, $organization->limits['storage_bytes']['limit_value']);

        $this->assertSame(2, CorePlan::whereIn('key', ['personal-free', 'organization-free'])->count());
        $this->assertSame(7, (int) $personal->graceDays);

        // Published versions stay immutable (C5-1 contract preserved).
        try {
            $plans->setLimit('personal-free', 1, 'projects', 99);
            $this->fail('published version must reject limit writes');
        } catch (\App\Core\Plans\PlanProvisioningException $exception) {
            $this->assertSame('plan_version_immutable', $exception->errorCode);
        }
    }

    public function test_system_activation_is_restricted_to_free_plans(): void
    {
        $this->publishFree();
        [$user, $workspace] = $this->personalUserWithWorkspace();
        $service = app(SubscriptionService::class);

        // The system path refuses any non-Free plan key.
        try {
            $service->assignInitialFree($user, $workspace, 'some-paid-plan', 1, 'x-1');
            $this->fail('non-free key must be refused');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_forbidden', $exception->errorCode);
        }

        // The platform path still refuses a plain end user (no escalation).
        try {
            $service->assignInitial($user, $workspace, 'personal-free', 1, CarbonImmutable::now(), CarbonImmutable::now()->addYear(), 'r', 'x-2');
            $this->fail('platform path must refuse non-platform actor');
        } catch (SubscriptionException $exception) {
            $this->assertSame('subscription_forbidden', $exception->errorCode);
        }

        $activator = app(FreePlanActivator::class);
        $this->assertSame(FreePlanActivator::ACTIVATED, $activator->activateForPersonalWorkspace($user, $workspace, 'auth-activation-'.$user->id));
        $this->assertSame(FreePlanActivator::EXISTING, $activator->activateForPersonalWorkspace($user, $workspace, 'auth-activation-'.$user->id));
        $this->assertSame(1, CoreSubscription::where('personal_workspace_id', $workspace->id)->count());
    }

    public function test_missing_plan_pending_then_resume_without_duplicate_workspace(): void
    {
        [$user, $workspace] = $this->personalUserWithWorkspace();

        // Plan not published yet: activation records pending, no fake success.
        app(AccountActivationService::class)->activate($user);
        $this->assertDatabaseHas('free_activation_pending', ['owner_key' => 'ws:'.$workspace->id]);
        $this->assertSame(0, CoreSubscription::where('personal_workspace_id', $workspace->id)->count());

        $this->publishFree();
        Artisan::call('subscriptions:resume-pending-free');

        $this->assertSame(1, CoreSubscription::where('personal_workspace_id', $workspace->id)->count());
        // No duplicate workspace was created for the retry.
        $this->assertSame(1, Workspace::personal()->where('owner_user_id', $user->id)->count());
        $this->assertNotNull(FreeActivationPending::where('owner_key', 'ws:'.$workspace->id)->first()->resolved_at);

        // Resume is idempotent.
        Artisan::call('subscriptions:resume-pending-free');
        $this->assertSame(1, CoreSubscription::where('personal_workspace_id', $workspace->id)->count());
    }

    public function test_existing_paid_subscription_is_never_overwritten(): void
    {
        $plans = app(PlanProvisioner::class);
        app(ModuleRegistrySynchronizer::class)->sync();
        $plans->createPlan('growth-x', 'Growth', 'personal');
        $plans->createDraftVersion('growth-x', 1, 7);
        $plans->publish('growth-x', 1);
        $this->publishFree();

        [$user, $workspace] = $this->personalUserWithWorkspace();
        $version = CorePlan::where('key', 'growth-x')->first()->versions()->first();
        CoreSubscription::create([
            'personal_workspace_id' => $workspace->id,
            'plan_version_id' => $version->id,
            'starts_at' => now(), 'expires_at' => now()->addYear(), 'grace_ends_at' => now()->addYear()->addDays(7),
        ]);

        $this->assertSame(FreePlanActivator::CONFLICT, app(FreePlanActivator::class)->activateForPersonalWorkspace($user, $workspace, 'auth-activation-'.$user->id));
        $this->assertSame($version->id, CoreSubscription::where('personal_workspace_id', $workspace->id)->first()->plan_version_id);
    }

    public function test_organization_creation_auto_activates_free_idempotently(): void
    {
        $this->publishFree();
        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'سازمان آزمایشی');

        $subscription = CoreSubscription::where('organization_id', $organization->id)->first();
        $this->assertNotNull($subscription);
        $this->assertSame('organization-free', $subscription->planVersion->plan->key);

        // Repeated trigger: same subscription, no duplicate.
        $this->assertSame(FreePlanActivator::EXISTING, app(FreePlanActivator::class)->activateForOrganization($creator, $organization, 'org-creation-'.$organization->id));
        $this->assertSame(1, CoreSubscription::where('organization_id', $organization->id)->count());
    }

    public function test_organization_created_before_publication_resumes_but_legacy_does_not(): void
    {
        $creator = User::factory()->create(['status' => 'active']);
        $provisioner = app(OrganizationProvisioner::class);
        $newOrg = $provisioner->create($creator, 'سازمان تازه');
        $legacyOrg = $provisioner->create($creator, 'سازمان قدیمی');
        // Legacy simulation: no pending record (pre-M1 organization).
        FreeActivationPending::where('organization_id', $legacyOrg->id)->delete();

        $this->assertSame(0, CoreSubscription::whereIn('organization_id', [$newOrg->id, $legacyOrg->id])->count());
        $this->assertDatabaseHas('free_activation_pending', ['organization_id' => $newOrg->id]);

        $this->publishFree();
        Artisan::call('subscriptions:resume-pending-free');

        $this->assertSame(1, CoreSubscription::where('organization_id', $newOrg->id)->count());
        $this->assertSame(0, CoreSubscription::where('organization_id', $legacyOrg->id)->count());
    }

    public function test_project_member_workspace_and_storage_limits(): void
    {
        $this->publishFree();
        [$user, $workspace] = $this->personalUserWithWorkspace();
        app(FreePlanActivator::class)->activateForPersonalWorkspace($user, $workspace, 'auth-activation-'.$user->id);
        $guard = app(ResourceLimitGuard::class);

        // Member cap (owner is the single member of Personal Free).
        try {
            $guard->assertCanCreate($workspace, 'workspace_members');
            $this->fail('workspace member cap must block');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }

        // Additional personal workspace blocked at limit 1.
        try {
            app(PersonalWorkspaceProvisioner::class)->createAdditional($user, 'دوم');
            $this->fail('workspace cap must block');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }

        // Projects: 3 active allowed, 4th blocked; completing frees quota.
        foreach (range(1, 3) as $i) {
            Project::create(['name' => "پروژه {$i}", 'workspace_id' => $workspace->id, 'status' => 'active']);
        }
        try {
            $guard->assertCanCreate($workspace, 'projects');
            $this->fail('project cap must block');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
        Project::where('workspace_id', $workspace->id)->first()->update(['status' => 'completed']);
        $guard->assertCanCreate($workspace, 'projects');
        $this->addToAssertionCount(1);

        // Storage: supported measure = DAM files owned by the user.
        DB::table('dam_assets')->insert(['id' => 9001, 'owner_id' => $user->id, 'created_by' => $user->id, 'type' => 'file', 'title' => 'f', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('dam_files')->insert(['asset_id' => 9001, 'original_filename' => 'a.zip', 'stored_filename' => 'a.zip', 'mime_type' => 'application/zip', 'file_size' => 60 * 1024 * 1024, 'checksum' => str_repeat('a', 64), 'storage_disk' => 'local', 'storage_path' => 'x/a.zip', 'created_at' => now(), 'updated_at' => now()]);
        $usage = app(CoreResourceUsageReader::class)->measure(new SubscriptionOwner('personal', null, $workspace));
        $this->assertSame(60 * 1024 * 1024, $usage['storage_bytes']);
        $guard->assertStorageAvailable($user, 39 * 1024 * 1024); // 99MB total OK
        try {
            $guard->assertStorageAvailable($user, 41 * 1024 * 1024); // 101MB total
            $this->fail('storage cap must block');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
    }
}
