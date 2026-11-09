<?php

namespace App\Core\Modules\Contracts;

use App\Core\Workspaces\Workspace;

/**
 * The C5 entitlement boundary (Stage C4-1 contract only).
 *
 * Whether a workspace's owner (user or organization) is entitled
 * to a business module under its plan/subscription. C5 will
 * implement plans, billing, and entitlement evaluation behind
 * this interface; C4-1 ships no implementation that allows
 * anything: the default gate denies every module, so unknown or
 * absent entitlement always fails closed. Tests may substitute
 * explicit doubles to model known entitlements.
 */
interface ModuleEntitlementGate
{
    public function isEntitled(Workspace $workspace, string $moduleKey): bool;
}
