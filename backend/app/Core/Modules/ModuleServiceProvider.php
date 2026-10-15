<?php

namespace App\Core\Modules;

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
    }
}
