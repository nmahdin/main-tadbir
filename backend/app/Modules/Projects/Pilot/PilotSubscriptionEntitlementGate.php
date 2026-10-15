<?php

namespace App\Modules\Projects\Pilot;

use App\Core\Authorization\Contracts\SubscriptionEntitlementGate;
use App\Core\Authorization\GateDecision;
use App\Core\Workspaces\Workspace;

/**
 * Pilot subscription-entitlement gate: affirms only under the
 * PilotGatePolicy conditions (projects module, explicit opt-in,
 * non-production); otherwise reports unavailable so authorization
 * fails closed. This grants no subscription entitlement semantics —
 * Q-01 (subscription lifecycle) is OPEN and nothing here invents it;
 * it is a development-stage allowance with a hard production stop.
 */
final class PilotSubscriptionEntitlementGate implements SubscriptionEntitlementGate
{
    public function __construct(private readonly PilotGatePolicy $policy) {}

    public function evaluate(Workspace $workspace, string $moduleId): GateDecision
    {
        return $this->policy->allowsModule($moduleId)
            ? GateDecision::allow()
            : GateDecision::unavailable("Projects pilot gate is inactive for module [{$moduleId}]; subscription entitlement cannot be authorized (Q-01 open).");
    }
}
