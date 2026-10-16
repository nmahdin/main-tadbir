<?php

namespace Tests\Feature\Core;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Modules\CoreModule;
use App\Core\Modules\ModuleAvailability;
use App\Core\Modules\ModuleCatalog;
use App\Core\Modules\ModuleDefinition;
use App\Core\Modules\ModuleDependencyException;
use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Modules\ModuleRegistryConflictException;
use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Modules\UnavailableModuleEntitlementGate;
use App\Core\Modules\WorkspaceModule;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Stage C4-1 — code-defined module registry, synchronization,
 * dependency resolution, and the fail-closed entitlement
 * boundary.
 */
class ModuleRegistrySyncTest extends TestCase
{
    use RefreshDatabase;

    private const EXPECTED_KEYS = [
        'calendar', 'campaigns', 'challenges', 'chat', 'competitions', 'content', 'crm', 'dam',
        'events', 'finance', 'forms', 'goals', 'habits', 'hrm', 'meetings', 'notes',
        'operational-records', 'procurement', 'projects', 'surveys', 'tasks', 'workflows',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
    }

    public function test_catalog_is_deterministic_and_matches_the_approved_inventory(): void
    {
        $this->assertSame(self::EXPECTED_KEYS, ModuleCatalog::keys());
        $this->assertSame(ModuleCatalog::fingerprint(), ModuleCatalog::fingerprint());
        $this->assertNotSame('', ModuleCatalog::fingerprint());

        // Implementation reality: only the Projects pilot exists.
        $available = collect(ModuleCatalog::definitions())
            ->filter(fn (ModuleDefinition $d): bool => $d->isAvailable())
            ->map(fn (ModuleDefinition $d): string => $d->key)
            ->all();
        $this->assertSame(['projects'], $available);
        $this->assertFalse(ModuleCatalog::get('tasks')->isAvailable());
        $this->assertNull(ModuleCatalog::get('reporting'));
        $this->assertNull(ModuleCatalog::get('inventory'));
    }

    public function test_sync_is_idempotent_and_never_enables_anything(): void
    {
        $sync = app(ModuleRegistrySynchronizer::class);

        $first = $sync->sync();
        $this->assertSame(22, $first['modules_created']);
        $this->assertSame(25, $first['edges_created']);
        $this->assertSame(22, CoreModule::count());
        $this->assertSame(25, DB::table('core_module_dependencies')->count());

        $second = $sync->sync();
        $this->assertSame(['modules_created' => 0, 'edges_created' => 0], $second);
        $this->assertSame(22, CoreModule::count());

        // Disabled-by-default: no workspace rows are created by
        // synchronization, and none appear at workspace creation.
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $this->assertSame(0, WorkspaceModule::count());
        $sync->sync();
        $this->assertSame(0, WorkspaceModule::count());
        $this->assertSame(0, WorkspaceModule::where('workspace_id', $workspace->id)->count());
    }

    public function test_sync_preserves_existing_workspace_activation_and_memberships(): void
    {
        $sync = app(ModuleRegistrySynchronizer::class);
        $sync->sync();

        $creator = User::factory()->create(['status' => 'active']);
        $organization = app(OrganizationProvisioner::class)->create($creator, 'Module Org '.uniqid());
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $projects = CoreModule::where('key', 'projects')->firstOrFail();

        // A pre-existing activation record (as C4-2 will write)
        // must survive synchronization untouched.
        $activation = WorkspaceModule::create([
            'workspace_id' => $workspace->id,
            'module_id' => $projects->id,
            'status' => WorkspaceModule::STATUS_ENABLED,
            'enabled_at' => now(),
            'enabled_by_user_id' => $creator->id,
        ]);
        $membershipsBefore = DB::table('workspace_memberships')->where('workspace_id', $workspace->id)->count();

        $sync->sync();

        $this->assertTrue($activation->fresh()->isEnabled());
        $this->assertSame($membershipsBefore, DB::table('workspace_memberships')->where('workspace_id', $workspace->id)->count());
        $this->assertSame(1, WorkspaceModule::count());
    }

    public function test_sync_grants_no_permissions(): void
    {
        $permissionsBefore = DB::table('core_permissions')->count();
        $rolesBefore = DB::table('core_roles')->count() + DB::table('platform_roles')->count();

        app(ModuleRegistrySynchronizer::class)->sync();

        $this->assertSame($permissionsBefore, DB::table('core_permissions')->count());
        $this->assertSame($rolesBefore, DB::table('core_roles')->count() + DB::table('platform_roles')->count());
        $this->assertSame(0, DB::table('platform_role_assignments')->count());
    }

    public function test_sync_rejects_conflicting_persisted_definitions(): void
    {
        CoreModule::create(['key' => 'tasks', 'name' => 'Renamed Locally', 'availability' => 'unavailable']);

        try {
            app(ModuleRegistrySynchronizer::class)->sync();
            $this->fail('A conflicting persisted definition must abort synchronization.');
        } catch (ModuleRegistryConflictException) {
            $this->assertSame('Renamed Locally', CoreModule::where('key', 'tasks')->value('name'));
        }
    }

    public function test_sync_rejects_unexpected_persisted_modules_and_edges(): void
    {
        CoreModule::create(['key' => 'rogue', 'name' => 'Rogue', 'availability' => 'available']);

        try {
            app(ModuleRegistrySynchronizer::class)->sync();
            $this->fail('An unknown persisted module must abort synchronization.');
        } catch (ModuleRegistryConflictException) {
            $this->addToAssertionCount(1);
        }

        CoreModule::where('key', 'rogue')->delete();
        app(ModuleRegistrySynchronizer::class)->sync();

        // An edge the catalog does not declare is also a conflict.
        $tasks = CoreModule::where('key', 'tasks')->firstOrFail();
        $forms = CoreModule::where('key', 'forms')->firstOrFail();
        DB::table('core_module_dependencies')->insert([
            'module_id' => $tasks->id, 'required_module_id' => $forms->id,
        ]);
        try {
            app(ModuleRegistrySynchronizer::class)->sync();
            $this->fail('An unexpected persisted edge must abort synchronization.');
        } catch (ModuleRegistryConflictException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_dependency_closure_topological_order_and_reverse_lookup(): void
    {
        $resolver = ModuleDependencyResolver::fromCatalog();

        $this->assertSame(['forms'], $resolver->prerequisitesFor('surveys'));
        $this->assertSame(['crm', 'finance', 'workflows'], $resolver->directPrerequisites('procurement'));

        $eventsClosure = $resolver->prerequisitesFor('events');
        $this->assertEqualsCanonicalizing(
            ['calendar', 'content', 'crm', 'dam', 'finance', 'forms', 'tasks', 'workflows'],
            $eventsClosure,
        );
        // Topological property: prerequisites precede dependents.
        $order = $resolver->topologicalOrder();
        $this->assertLessThan(array_search('events', $order), array_search('tasks', $order));
        $this->assertLessThan(array_search('surveys', $order), array_search('forms', $order));
        $this->assertLessThan(array_search('procurement', $order), array_search('workflows', $order));

        $this->assertSame(
            ['challenges', 'competitions', 'events', 'surveys'],
            $resolver->dependentsOf('forms'),
        );
        $this->assertEqualsCanonicalizing(
            ['events', 'hrm', 'procurement'],
            $resolver->allDependentsOf('workflows'),
        );
    }

    public function test_resolver_rejects_cycles_self_missing_duplicate_and_unknown(): void
    {
        $make = fn (string $key, array $deps): ModuleDefinition => new ModuleDefinition(
            $key, ucfirst($key), ModuleAvailability::Unavailable, $deps,
        );

        $this->assertResolverFails('dependency_cycle', [$make('a', ['b']), $make('b', ['a'])]);
        $this->assertResolverFails('self_dependency', [$make('a', ['a'])]);
        $this->assertResolverFails('missing_dependency', [$make('a', ['ghost'])]);
        $this->assertResolverFails('duplicate_dependency', [$make('a', ['b', 'b']), $make('b', [])]);

        $resolver = new ModuleDependencyResolver([$make('a', ['b']), $make('b', [])]);
        try {
            $resolver->prerequisitesFor('nope');
            $this->fail('Unknown modules must be rejected.');
        } catch (ModuleDependencyException $exception) {
            $this->assertSame('unknown_module', $exception->errorCode);
        }
    }

    public function test_entitlement_boundary_fails_closed_by_default(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $workspace = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);

        $gate = app(ModuleEntitlementGate::class);
        $this->assertInstanceOf(UnavailableModuleEntitlementGate::class, $gate);
        $this->assertFalse($gate->isEntitled($workspace, 'projects'));
        $this->assertFalse($gate->isEntitled($workspace, 'tasks'));
        $this->assertFalse($gate->isEntitled($workspace, 'anything'));

        // A test double can model a known entitlement without
        // changing the production default.
        $double = new class implements ModuleEntitlementGate
        {
            public function isEntitled(Workspace $workspace, string $moduleKey): bool
            {
                return $moduleKey === 'projects';
            }
        };
        $this->assertTrue($double->isEntitled($workspace, 'projects'));
        $this->assertFalse($double->isEntitled($workspace, 'tasks'));
    }

    /**
     * @param  list<ModuleDefinition>  $definitions
     */
    private function assertResolverFails(string $code, array $definitions): void
    {
        try {
            new ModuleDependencyResolver($definitions);
            $this->fail("Resolver must fail with [{$code}].");
        } catch (ModuleDependencyException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
