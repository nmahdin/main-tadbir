<?php

namespace App\Core\Authorization;

use App\Core\Authorization\Contracts\OrganizationPolicyGate;
use App\Core\Workspaces\Workspace;

/**
 * Default Stage 04A implementation: organization policy evaluation
 * does not exist yet, so the gate reports unavailable and
 * authorization fails closed. Replaced when org policy lands.
 */
final class UnimplementedOrganizationPolicyGate implements OrganizationPolicyGate
{
    public function evaluate(Workspace $workspace, string $permissionKey): GateDecision
    {
        return GateDecision::unavailable("Organization policy gate is not implemented; permission [{$permissionKey}] cannot be authorized for a module operation.");
    }
}
