<?php

namespace App\Console\Commands;

use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationService;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Plans\CorePlan;
use App\Core\Plans\PlanProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use App\Core\Settings\SettingValueStore;
use App\Core\Subscriptions\SubscriptionService;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Demo scenario data (ARCH-01) — LOCAL/TESTING ONLY.
 *
 * Fails closed in every other environment. Everything created is
 * recognizably DEMO (names, `demo-*` usernames, `@example.test`
 * addresses), idempotent via deterministic natural keys, and built
 * exclusively through the real Core provisioners/services — the
 * C1–C7 rules therefore hold for demo data too.
 *
 * Credentials: the shared demo password comes from the
 * DEMO_USER_PASSWORD environment variable, or is generated
 * randomly and printed ONCE here. No fixed known password exists
 * in the codebase.
 *
 * Privileges: this command NEVER creates platform assignments.
 * A demo subscription is assigned only when DEMO_SUBSCRIPTION_ACTOR
 * names an EXISTING user who already holds
 * platform.subscriptions.manage through normal provisioning.
 */
final class SeedDemoData extends Command
{
    protected $signature = 'tadbir:seed-demo';

    protected $description = 'Create the deterministic DEMO scenario (local/testing environments only)';

    public function handle(
        OrganizationProvisioner $organizations,
        PersonalWorkspaceProvisioner $personalWorkspaces,
        RoleProvisioner $roles,
        PlanProvisioner $plans,
        SettingValueStore $settings,
        SettingsRegistrySynchronizer $settingsRegistry,
        ModuleRegistrySynchronizer $moduleRegistry,
        InvitationService $invitations,
        SubscriptionService $subscriptions,
    ): int {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('tadbir:seed-demo is restricted to local/testing environments; refusing to run here.');

            return self::FAILURE;
        }

        PermissionCatalog::sync();
        // Reference data the demo records build on (idempotent).
        $settingsRegistry->sync(app(SettingsRegistry::class));
        $moduleRegistry->sync();

        $generatedPassword = null;
        $password = (string) (env('DEMO_USER_PASSWORD') ?: ($generatedPassword = Str::random(24)));

        $owner = $this->demoUser('demo-owner', 'DEMO Owner', $password);
        $member = $this->demoUser('demo-member', 'DEMO Member', $password);

        // Organization + default workspace through the real C3
        // provisioner (creator becomes organization/workspace
        // manager via protected roles; nothing else is granted).
        $organization = Organization::query()->where('slug', 'demo-organization')->first()
            ?? $organizations->create($owner, 'DEMO Organization', 'demo-organization');

        $memberRole = $roles->organizationMember($organization);
        OrganizationMembership::query()->firstOrCreate(
            ['organization_id' => $organization->id, 'user_id' => $member->id],
            ['role_id' => $memberRole->id, 'status' => MembershipStatus::Active],
        );

        // The member's own personal workspace (C3 rules: theirs).
        $personalWorkspaces->ensureDefault($member);

        // A published DEMO plan through the real provisioner
        // (draft → publish; no tiers/prices invented for product,
        // this is a clearly-named demo artifact).
        if (! CorePlan::query()->where('key', 'demo-plan')->exists()) {
            $plans->createPlan('demo-plan', 'DEMO Plan', 'organization');
            $plans->createDraftVersion('demo-plan', 1, 0);
            $plans->setModuleEntitlement('demo-plan', 1, 'projects', true);
            $plans->publish('demo-plan', 1);
        }

        // Optional subscription: only via an already-authorized
        // actor named by the operator (never created here).
        $actorUsername = (string) env('DEMO_SUBSCRIPTION_ACTOR', '');
        if ($actorUsername !== '') {
            $actor = User::query()->where('username', $actorUsername)->first();
            if ($actor === null) {
                $this->warn("DEMO_SUBSCRIPTION_ACTOR [{$actorUsername}] not found; subscription skipped.");
            } else {
                $subscriptions->assignInitial(
                    $actor,
                    $organization,
                    'demo-plan',
                    1,
                    CarbonImmutable::now('UTC'),
                    CarbonImmutable::now('UTC')->addYear(),
                    'DEMO scenario subscription (local only)',
                    'demo-subscription-v1',
                );
                $this->info('DEMO subscription assigned via the authorized actor.');
            }
        }

        // Sample public settings via the C7 store primitive
        // (values are plainly demo text; no secrets involved).
        $settings->put('organization', (int) $organization->id, 'organization.public.description', 'DEMO organization for local development — not real data.');
        $settings->put('user', (int) $owner->id, 'user.experience.locale', 'en');

        // Stage C7-4 demo display defaults: fictional Organization
        // display defaults plus one override-policy example (the
        // Organization allows Workspace overrides of the display
        // timezone, but not of the display locale). No secret of
        // any kind is seeded — none exists in the demo scenario.
        $settings->put('organization', (int) $organization->id, 'display.locale', 'fa');
        $settings->put('organization', (int) $organization->id, 'display.timezone', 'Asia/Tehran');
        $settings->putOverridePolicy((int) $organization->id, 'display.timezone', true, (int) $owner->id);

        // One pending demo invitation through the real C6 service.
        $existing = CoreInvitation::query()
            ->where('organization_id', $organization->id)
            ->where('email_normalized', 'demo-invitee@example.test')
            ->where('status', CoreInvitation::STATUS_PENDING)
            ->exists();
        if (! $existing) {
            $invitations->issueOrganizationInvitation($owner, $organization, 'demo-invitee@example.test', $memberRole->id);
        }

        $this->info('DEMO scenario ready: organization [demo-organization], users [demo-owner, demo-member].');
        if ($generatedPassword !== null) {
            $this->warn("Generated demo password (printed once, local only): {$generatedPassword}");
        }

        return self::SUCCESS;
    }

    private function demoUser(string $username, string $name, string $password): User
    {
        return User::query()->firstOrCreate(
            ['username' => $username],
            [
                'name' => $name,
                'email' => $username.'@example.test',
                'password' => Hash::make($password),
                'status' => 'active',
            ],
        );
    }
}
