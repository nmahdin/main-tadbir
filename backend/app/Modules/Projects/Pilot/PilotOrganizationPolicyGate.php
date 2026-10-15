<?php

namespace App\Modules\Projects\Pilot;

use App\Core\Authorization\Contracts\OrganizationPolicyGate;
use App\Core\Authorization\GateDecision;
use App\Core\Workspaces\Workspace;

/**
 * Pilot organization-policy gate: affirms only for Projects-module
 * permission keys under the PilotGatePolicy conditions; otherwise
 * reports unavailable so authorization fails closed. It invents no
 * organization policy semantics — real policy rules land later.
 */
final class PilotOrganizationPolicyGate implements OrganizationPolicyGate
{
    public function __construct(private readonly PilotGatePolicy $policy) {}

    public function evaluate(Workspace $workspace, string $permissionKey): GateDecision
    {
        return $this->policy->allowsPermission($permissionKey)
            ? GateDecision::allow()
            : GateDecision::unavailable("Projects pilot gate is inactive for permission [{$permissionKey}]; organization policy cannot be authorized.");
    }
}
