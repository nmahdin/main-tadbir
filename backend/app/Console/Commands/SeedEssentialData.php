<?php

namespace App\Console\Commands;

use App\Core\Modules\ModuleRegistrySynchronizer;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Settings\SettingsRegistry;
use App\Core\Settings\SettingsRegistrySynchronizer;
use Illuminate\Console\Command;

/**
 * Essential reference/configuration data (ARCH-01).
 *
 * Idempotent and safe to rerun in ANY environment, including
 * production, at explicit operator direction. Contains ONLY:
 * the permission catalog, the protected Primary Administrator
 * role DEFINITION (never an assignment), the module registry
 * mirror, and the settings registry mirror.
 *
 * It never creates user accounts, never assigns platform roles,
 * never activates modules, and never grants workspace access.
 */
final class SeedEssentialData extends Command
{
    protected $signature = 'tadbir:seed-essential';

    protected $description = 'Seed essential, idempotent Core reference data (no accounts, no grants, no activation)';

    public function handle(
        PlatformRoleProvisioner $platformRoles,
        ModuleRegistrySynchronizer $modules,
        SettingsRegistrySynchronizer $settings,
    ): int {
        PermissionCatalog::sync();
        $platformRoles->ensurePrimaryAdministrator();
        $modules->sync();
        $settings->sync(app(SettingsRegistry::class));

        $this->info('Essential Core reference data is in place (idempotent; no accounts or grants created).');

        return self::SUCCESS;
    }
}
