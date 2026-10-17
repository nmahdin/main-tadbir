<?php

namespace App\Core\Modules;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Plans\Contracts\SubscriptionAccessEvaluator;
use App\Core\Subscriptions\CoreResourceUsageReader;
use App\Core\Subscriptions\ResourceUsageReader;
use App\Core\Subscriptions\SubscriptionEntitlementEvaluator;
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

        // C5-3: real subscription entitlement evaluation. One
        // fail-closed evaluator implements both the runtime access
        // contract (SubscriptionAccessEvaluator) and the C4
        // activation gate (ModuleEntitlementGate, activation
        // semantics). It denies whenever subscriptions are missing,
        // ambiguous, or corrupt — there is no permissive fallback.
        // The previous UnavailableModuleEntitlementGate remains
        // available for explicit test/fallback use only.
        $this->app->singleton(SubscriptionEntitlementEvaluator::class);
        $this->app->bind(ModuleEntitlementGate::class, SubscriptionEntitlementEvaluator::class);
        $this->app->bind(SubscriptionAccessEvaluator::class, SubscriptionEntitlementEvaluator::class);
    }
}
