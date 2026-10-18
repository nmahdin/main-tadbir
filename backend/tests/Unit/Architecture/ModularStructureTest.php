<?php

namespace Tests\Unit\Architecture;

use App\Core\Architecture\DomainPaths;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * ARCH-01 structural enforcement: domain-owned folders exist,
 * registration is deterministic, Core routes live in domain files
 * (never again inline in the registrar), and the essential/demo
 * seeding separation holds at source level.
 */
class ModularStructureTest extends TestCase
{
    public function test_every_core_domain_and_module_has_database_folders(): void
    {
        foreach (DomainPaths::CORE_DOMAINS as $domain) {
            $this->assertDirectoryExists(app_path("Core/{$domain}/Database/Migrations"), "Core/{$domain} migrations folder");
            $this->assertDirectoryExists(app_path("Core/{$domain}/Database/Seeders"), "Core/{$domain} seeders folder");
        }

        foreach (DomainPaths::BUSINESS_MODULES as $module) {
            $this->assertDirectoryExists(app_path("Modules/{$module}/Database/Migrations"), "Modules/{$module} migrations folder");
            $this->assertDirectoryExists(app_path("Modules/{$module}/Database/Seeders"), "Modules/{$module} seeders folder");
        }
    }

    public function test_migration_paths_are_deterministic_and_history_first(): void
    {
        $paths = DomainPaths::migrationPaths();
        $this->assertSame(database_path('migrations'), $paths[0], 'historical migrations stay first and unmoved');
        $this->assertSame($paths, DomainPaths::migrationPaths(), 'registration must be deterministic');
        $this->assertContains(app_path('Core/Settings/Database/Migrations'), $paths);
        $this->assertGreaterThanOrEqual(1 + count(DomainPaths::CORE_DOMAINS), count($paths));
    }

    public function test_core_routes_live_in_domain_files_not_in_the_registrar(): void
    {
        $registrar = (string) file_get_contents(base_path('routes/api.php'));
        $this->assertStringNotContainsString("Route::get('core/organizations'", $registrar);
        $this->assertStringNotContainsString("Route::prefix('platform')", $registrar);
        $this->assertStringNotContainsString('invitations/preview', $registrar);
        $this->assertStringContainsString("DomainPaths::routeFiles()['authenticated']", $registrar);
        $this->assertStringContainsString("app_path('Core/Platform/Routes/api.php')", $registrar);

        foreach (DomainPaths::routeFiles() as $group) {
            foreach ($group as $file) {
                $this->assertFileExists($file);
                $this->assertStringContainsString('Route::', (string) file_get_contents($file));
            }
        }
    }

    public function test_demo_seeding_is_environment_guarded_and_out_of_production_seeders(): void
    {
        $demo = (string) file_get_contents(app_path('Console/Commands/SeedDemoData.php'));
        $this->assertStringContainsString("app()->environment(['local', 'testing'])", $demo, 'demo command must fail closed outside local/testing');
        $this->assertStringContainsString('self::FAILURE', $demo);

        $productionSeeder = (string) file_get_contents(database_path('seeders/DatabaseSeeder.php'));
        $this->assertStringNotContainsString('SeedDemoData', $productionSeeder, 'demo data must never join production seeding');
        $this->assertStringNotContainsString('tadbir:seed-demo', $productionSeeder);

        $essential = (string) file_get_contents(app_path('Console/Commands/SeedEssentialData.php'));
        $this->assertStringNotContainsString('demo-', $essential, 'essential seeding must not create demo artifacts');
    }

    public function test_frontend_feature_layout_holds(): void
    {
        $frontend = base_path('../frontend/src');
        $this->assertFileExists($frontend.'/app/App.tsx');
        $this->assertFileExists($frontend.'/features/invitations/invitationLogic.ts');
        $this->assertFileExists($frontend.'/features/invitations/invitationSession.ts');
        $this->assertFileExists($frontend.'/features/invitations/api.ts');
        $this->assertDirectoryExists($frontend.'/features/invitations/components');
        $this->assertFileDoesNotExist($frontend.'/invitations/invitationLogic.ts', 'moved feature must not leave a stale copy');
    }

    public function test_core_route_contract_is_unchanged_after_the_split(): void
    {
        $expected = [
            'api.v1.invitations.preview' => ['POST', 'api/v1/invitations/preview'],
            'api.v1.invitations.accept' => ['POST', 'api/v1/invitations/accept'],
            'api.v1.core.organizations.index' => ['GET', 'api/v1/core/organizations'],
            'api.v1.core.workspaces.modules.activate' => ['POST', 'api/v1/core/workspaces/{workspace}/modules/{module}/activate'],
            'api.v1.core.organizations.invitations.store' => ['POST', 'api/v1/core/organizations/{organization}/invitations'],
            'api.v1.auth.email.verification.confirm' => ['POST', 'api/v1/auth/email/verification/confirm'],
            'api.v1.platform.roles.index' => ['GET', 'api/v1/platform/roles'],
            'api.v1.platform.subscriptions.renew' => ['POST', 'api/v1/platform/subscriptions/{subscription}/renew'],
            'api.v1.auth.me' => ['GET', 'api/v1/auth/me'],
        ];

        foreach ($expected as $name => [$method, $uri]) {
            $route = Route::getRoutes()->getByName($name);
            $this->assertNotNull($route, "route [{$name}] must still exist");
            $this->assertContains($method, $route->methods());
            $this->assertSame($uri, $route->uri());
        }
    }
}
