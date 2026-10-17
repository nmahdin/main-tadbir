<?php

namespace App\Core\Modules;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use Illuminate\Support\ServiceProvider;

/**
 * Wires the module registry as a shared service.
 *
 * Stage 02 registers no business module: doing so before a module migrates
 * (Stage 05) would create a parallel source of truth. The registry is used
 * by architecture tests and the reference fixture now, and by each module
 * as it is introduced.
 */
final class ModuleServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ModuleRegistry::class, fn () => new ModuleRegistry);

        // C4-2: the dependency resolver over the canonical catalog,
        // shared by the activation planner/service.
        $this->app->singleton(ModuleDependencyResolver::class, fn () => ModuleDependencyResolver::fromCatalog());

        // C4-1: no entitlement engine exists until C5. The
        // default binding fails closed for every module.
        $this->app->bind(ModuleEntitlementGate::class, UnavailableModuleEntitlementGate::class);
    }
}
