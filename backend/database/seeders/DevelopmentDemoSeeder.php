<?php

namespace Database\Seeders;

use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\OrganizationRoleService;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\WorkspaceRoleService;
use App\Core\Subscriptions\FreePlanActivator;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\DomainRecord;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Development-only demo dataset (local/testing). NOT part of
 * DatabaseSeeder and NEVER run automatically.
 *
 *   php artisan db:seed --class=DevelopmentDemoSeeder
 *
 * Fail-closed contract:
 *  - refuses to run outside local/testing;
 *  - requires the DEMO_*_PASSWORD env values (see config/demo_seed.php)
 *    and aborts before creating anything when any is missing/invalid;
 *  - never overwrites an existing account, password, membership,
 *    subscription, project, or task (everything is firstOrCreate);
 *  - respects the published Free-plan limits (projects stay within
 *    the Personal/Organization Free quotas; memberships within the
 *    Organization Free member cap);
 *  - drives real domain services: PersonalWorkspaceProvisioner,
 *    FreePlanActivator, OrganizationProvisioner (which auto-activates
 *    Organization Free), RoleProvisioner and the system role
 *    assignment path — no fabricated entitlement rows.
 */
class DevelopmentDemoSeeder extends Seeder
{
    /** @var array<string, array{name: string, config: string}> */
    private const ACCOUNTS = [
        'demo.platform' => ['name' => 'مدیر پلتفرم (نمایشی)', 'config' => 'platform_password'],
        'demo.personal' => ['name' => 'کاربر شخصی (نمایشی)', 'config' => 'personal_password'],
        'demo.owner' => ['name' => 'مالک سازمان (نمایشی)', 'config' => 'org_owner_password'],
        'demo.member' => ['name' => 'عضو سازمان (نمایشی)', 'config' => 'org_member_password'],
        'demo.member2' => ['name' => 'عضو سازمان بدون فضای کاری (نمایشی)', 'config' => 'org_member2_password'],
    ];

    private const ORG_NAME = 'سازمان نمونهٔ تدبیر';

    private const ORG_SLUG = 'demo-org';

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('DevelopmentDemoSeeder فقط در محیط‌های local/testing مجاز است و در production اجرا نمی‌شود.');
        }

        $passwords = $this->validatedPasswords();

        DB::transaction(function () use ($passwords): void {
            // Foundation the demo relies on (all idempotent).
            $this->call([PermissionSeeder::class, RoleSeeder::class]);
            PermissionCatalog::sync();
            app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
            Artisan::call('plans:provision-free');

            $users = $this->ensureAccounts($passwords);
            $this->ensurePlatformAdmin($users['demo.platform']);
            $workspaces = $this->ensurePersonalFree($users);
            $organization = $this->ensureOrganization($users);
            $this->seedPersonalProjects($users['demo.personal'], $workspaces['demo.personal']);
            $this->seedOrganizationProjects($users, $organization);
            $this->seedNotifications($users);

            $this->command?->info('Demo seed complete: '.count($users).' accounts, 1 organization (Organization Free), personal Free workspaces for all accounts.');
        });
    }

    /**
     * Every demo password must be configured before anything is
     * created; the supplied values are never printed or logged.
     *
     * @return array<string, string> username => password
     */
    private function validatedPasswords(): array
    {
        $passwords = [];
        $problems = [];

        foreach (self::ACCOUNTS as $username => $definition) {
            $value = config('demo_seed.'.$definition['config']);
            $envName = 'DEMO_'.strtoupper(str_replace('_password', '', $definition['config'])).'_PASSWORD';
            if (! is_string($value) || strlen($value) < 8) {
                $problems[] = $envName.' تنظیم نشده یا کوتاه‌تر از ۸ نویسه است.';
            } elseif (strlen($value) > 72) {
                $problems[] = $envName.' نباید بیشتر از ۷۲ بایت باشد (محدودیت bcrypt).';
            } else {
                $passwords[$username] = $value;
            }
        }

        if ($problems !== []) {
            throw new RuntimeException("پیکربندی حساب‌های نمایشی ناقص است:\n- ".implode("\n- ", $problems)."\nمقادیر را فقط در backend/.env محلی تنظیم کنید؛ راهنما: docs/demo-seeder.md");
        }

        return $passwords;
    }

    /**
     * @param  array<string, string>  $passwords
     * @return array<string, User>
     */
    private function ensureAccounts(array $passwords): array
    {
        $teamMember = Role::where('key', 'team_member')->first();
        $users = [];

        foreach (self::ACCOUNTS as $username => $definition) {
            // Existing accounts are never modified (passwords included).
            $users[$username] = User::firstOrCreate(
                ['username' => $username],
                [
                    'name' => $definition['name'],
                    'password' => $passwords[$username], // hashed cast on User
                    'role_id' => $teamMember?->id,
                    'role_key' => $teamMember?->key,
                    'status' => 'active',
                ],
            );
        }

        return $users;
    }

    private function ensurePlatformAdmin(User $platformUser): void
    {
        $role = PlatformRole::where('key', PlatformRoleProvisioner::PRIMARY_ROLE_KEY)->firstOrFail();

        // Bootstrap path (same shape as the platform test fixtures):
        // the protected primary role is granted by direct assignment
        // exactly once; PlatformAssignmentService requires an already
        // authorized actor and therefore cannot bootstrap itself.
        PlatformRoleAssignment::firstOrCreate([
            'user_id' => $platformUser->id,
            'platform_role_id' => $role->id,
        ]);
    }

    /**
     * @param  array<string, User>  $users
     * @return array<string, Workspace>
     */
    private function ensurePersonalFree(array $users): array
    {
        $provisioner = app(PersonalWorkspaceProvisioner::class);
        $activator = app(FreePlanActivator::class);
        $workspaces = [];

        foreach ($users as $username => $user) {
            $workspace = $provisioner->ensureDefault($user);
            // ACTIVATED/EXISTING are both success; PENDING cannot happen
            // here because plans:provision-free ran above.
            $activator->activateForPersonalWorkspace($user, $workspace, 'demo-seed:'.$username);
            $workspaces[$username] = $workspace;
        }

        return $workspaces;
    }

    /**
     * @param  array<string, User>  $users
     */
    private function ensureOrganization(array $users): Organization
    {
        $organization = Organization::where('slug', self::ORG_SLUG)->first();

        if ($organization === null) {
            // Real provisioning: default workspace, owner memberships,
            // protected roles, and automatic Organization Free (M1).
            $organization = app(OrganizationProvisioner::class)->create($users['demo.owner'], self::ORG_NAME, self::ORG_SLUG);
        }

        $roles = app(RoleProvisioner::class)->ensureForOrganization($organization);
        $organizationRoles = app(OrganizationRoleService::class);
        $workspaceRoles = app(WorkspaceRoleService::class);
        $workspace = $organization->workspaces()->orderBy('id')->firstOrFail();
        $workspaceRolesByKey = app(RoleProvisioner::class)->ensureForWorkspace($workspace);

        // demo.member: organization member + member of the default
        // workspace. demo.member2: organization member only (no
        // workspace membership) — the org/workspace distinction stays
        // visible in navigation. Organization Free caps the org at 3
        // members; owner + these two exactly reach it.
        foreach (['demo.member' => true, 'demo.member2' => false] as $username => $joinsWorkspace) {
            $membership = OrganizationMembership::firstOrCreate(
                ['organization_id' => $organization->id, 'user_id' => $users[$username]->id],
                ['status' => MembershipStatus::Active->value],
            );
            if ($membership->role_id === null) {
                $organizationRoles->assignSystemRole($membership, $roles['member']);
            }

            if ($joinsWorkspace) {
                $workspaceMembership = WorkspaceMembership::firstOrCreate(
                    ['workspace_id' => $workspace->id, 'user_id' => $users[$username]->id],
                    ['status' => MembershipStatus::Active->value],
                );
                if ($workspaceMembership->role_id === null) {
                    $workspaceRoles->assignSystemRole($workspaceMembership, $workspaceRolesByKey['member']);
                }
            }
        }

        return $organization;
    }

    private function seedPersonalProjects(User $owner, Workspace $workspace): void
    {
        // Personal Free allows 3 ACTIVE projects: 2 non-terminal +
        // 1 completed keeps one slot free for interactive creation.
        $projects = [
            ['name' => 'برنامه‌ریزی محتوای شخصی', 'status' => 'active', 'progress' => 40, 'priority' => 'high'],
            ['name' => 'پروژهٔ یادگیری زبان', 'status' => 'planning', 'progress' => 10, 'priority' => 'medium'],
            ['name' => 'سامان‌دهی اسناد (پایان‌یافته)', 'status' => 'completed', 'progress' => 100, 'priority' => 'low'],
        ];

        foreach ($projects as $definition) {
            $project = Project::firstOrCreate(
                ['workspace_id' => $workspace->id, 'name' => $definition['name']],
                $definition + ['project_manager_id' => $owner->id, 'start_date' => now()->subDays(10), 'deadline' => now()->addDays(14)],
            );
            $this->seedTasks($project, $workspace, $owner);
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedOrganizationProjects(array $users, Organization $organization): void
    {
        $workspace = $organization->workspaces()->orderBy('id')->firstOrFail();
        $owner = $users['demo.owner'];
        $member = $users['demo.member'];

        // Organization Free allows 5 ACTIVE projects: 3 non-terminal +
        // 1 completed.
        $projects = [
            ['name' => 'کمپین معرفی محصول', 'status' => 'active', 'progress' => 55, 'priority' => 'high', 'manager' => $owner],
            ['name' => 'بازطراحی وب‌سایت سازمان', 'status' => 'active', 'progress' => 25, 'priority' => 'medium', 'manager' => $member],
            ['name' => 'برنامهٔ محتوای فصل آینده', 'status' => 'planning', 'progress' => 5, 'priority' => 'medium', 'manager' => $owner],
            ['name' => 'آرشیو کمپین گذشته', 'status' => 'completed', 'progress' => 100, 'priority' => 'low', 'manager' => $owner],
        ];

        foreach ($projects as $definition) {
            $manager = $definition['manager'];
            unset($definition['manager']);
            $project = Project::firstOrCreate(
                ['workspace_id' => $workspace->id, 'name' => $definition['name']],
                $definition + ['project_manager_id' => $manager->id, 'start_date' => now()->subDays(7), 'deadline' => now()->addDays(21)],
            );
            $this->seedTasks($project, $workspace, $manager, $member);
        }
    }

    private function seedTasks(Project $project, Workspace $workspace, User $manager, ?User $teammate = null): void
    {
        // Dated tasks double as the calendar's data source (the
        // calendar aggregates dated workspace records; there is no
        // separate calendar-entry record type in the backend).
        $tasks = [
            ['title' => 'جمع‌بندی وضعیت و قدم بعدی', 'status' => 'todo', 'assignee_id' => $manager->id, 'deadline' => now()->toDateString(), 'priority' => 'high'],
            ['title' => 'بازبینی خروجی هفته', 'status' => 'in_progress', 'assignee_id' => ($teammate ?? $manager)->id, 'deadline' => now()->addDay()->toDateString(), 'priority' => 'medium'],
            ['title' => 'مستندسازی تصمیم‌ها', 'status' => 'backlog', 'assignee_id' => $manager->id, 'deadline' => now()->addDays(5)->toDateString(), 'priority' => 'low'],
        ];

        foreach ($tasks as $definition) {
            Task::firstOrCreate(
                ['workspace_id' => $workspace->id, 'project_id' => $project->id, 'title' => $definition['title']],
                $definition,
            );
        }
    }

    /**
     * @param  array<string, User>  $users
     */
    private function seedNotifications(array $users): void
    {
        foreach (['demo.personal', 'demo.owner'] as $username) {
            $user = $users[$username];

            // One unread ordinary notification (idempotent by key)…
            DomainRecord::firstOrCreate(
                ['notification_key' => hash('sha256', 'demo-welcome:'.$user->id)],
                [
                    'domain' => DomainRecord::DOMAIN_NOTIFICATION,
                    'user_id' => $user->id,
                    'title' => 'به محیط نمایشی تدبیر خوش آمدید',
                    'payload' => [
                        'userId' => (string) $user->id,
                        'title' => 'به محیط نمایشی تدبیر خوش آمدید',
                        'message' => 'این یک اعلان نمونهٔ خوانده‌نشده در محیط توسعه است.',
                        'type' => 'demo',
                        'notificationCategory' => 'tasks',
                        'read' => false,
                        'timestamp' => now()->toIso8601String(),
                    ],
                ],
            );

            // …and one already-read example.
            DomainRecord::firstOrCreate(
                ['notification_key' => hash('sha256', 'demo-read:'.$user->id)],
                [
                    'domain' => DomainRecord::DOMAIN_NOTIFICATION,
                    'user_id' => $user->id,
                    'title' => 'راهنمای شروع محیط نمایشی',
                    'read_at' => now()->subHour(),
                    'payload' => [
                        'userId' => (string) $user->id,
                        'title' => 'راهنمای شروع محیط نمایشی',
                        'message' => 'این اعلان نمونه از قبل خوانده شده است.',
                        'type' => 'demo',
                        'notificationCategory' => 'projects',
                        'read' => true,
                        'timestamp' => now()->subHours(2)->toIso8601String(),
                    ],
                ],
            );
        }
    }
}
