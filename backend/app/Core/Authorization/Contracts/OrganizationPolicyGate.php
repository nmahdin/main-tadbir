<?php

namespace App\Core\Authorization\Contracts;

use App\Core\Authorization\GateDecision;
use App\Core\Workspaces\Workspace;

/**
 * Whether organization-level policy permits a permission key in one of
 * the organization's workspaces (mandatory higher-scope policies,
 * core.md §2.1 step 5). Contract only in Stage 04A; the default
 * implementation reports "unavailable" and authorization fails closed.
 */
interface OrganizationPolicyGate
{
    public function evaluate(Workspace $workspace, string $permissionKey): GateDecision;
}
