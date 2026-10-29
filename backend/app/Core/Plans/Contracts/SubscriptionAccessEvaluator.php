<?php

namespace App\Core\Plans\Contracts;

use App\Core\Plans\ModuleAccessLevel;
use App\Core\Workspaces\Workspace;

/**
 * The C5-3 runtime entitlement evaluation contract (C5-1 defines
 * the contract only — no implementation is bound in C5-1, and the
 * production C4 gate `UnavailableModuleEntitlementGate` remains in
 * force unchanged until C5-3).
 *
 * Implementations resolve the workspace's subscription (C5-2),
 * read the stored plan entitlements (C5-1), apply expiry/grace
 * (C5-2), and return the access level. Organization suspension or
 * termination always overrides subscription outcomes (C3), and a
 * disabled workspace module is inaccessible even in grace or
 * read-only states (C4).
 */
interface SubscriptionAccessEvaluator
{
    /**
     * Runtime read/write eligibility for one module in one
     * workspace, as a ModuleAccessLevel.
     */
    public function accessLevel(Workspace $workspace, string $moduleKey): ModuleAccessLevel;

    /**
     * Activation eligibility for enabling a module — deliberately
     * a SEPARATE check from runtime access (an expired subscription
     * may still read, but may not newly activate).
     */
    public function canActivate(Workspace $workspace, string $moduleKey): bool;
}
