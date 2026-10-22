<?php

namespace App\Core\Authorization;

use App\Core\Authorization\Contracts\SubscriptionEntitlementGate;
use App\Core\Workspaces\Workspace;

/**
 * Default Stage 04A implementation: subscriptions do not exist yet
 * (Q-01 OPEN), so the gate reports unavailable and authorization
 * fails closed. No placeholder entitlement is granted, ever.
 */
final class UnimplementedSubscriptionEntitlementGate implements SubscriptionEntitlementGate
{
    public function evaluate(Workspace $workspace, string $moduleId): GateDecision
    {
        return GateDecision::unavailable("Subscription entitlement gate is not implemented; module [{$moduleId}] cannot be authorized.");
    }
}
