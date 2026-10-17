<?php

namespace App\Core\Modules;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Workspaces\Workspace;

/**
 * Default entitlement gate until C5 lands: no plan engine
 * exists, so nothing is entitled. Deliberately not an allow-all
 * placeholder — entitlement absence must fail closed.
 */
final class UnavailableModuleEntitlementGate implements ModuleEntitlementGate
{
    public function isEntitled(Workspace $workspace, string $moduleKey): bool
    {
        return false;
    }
}
