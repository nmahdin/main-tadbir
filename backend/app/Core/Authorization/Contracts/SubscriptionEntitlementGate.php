<?php

namespace App\Core\Authorization\Contracts;

use App\Core\Authorization\GateDecision;
use App\Core\Workspaces\Workspace;

/**
 * Whether the effective subscription entitles this workspace to a
 * module (Stage 06 billing slice; lifecycle semantics OPEN, Q-01).
 * Contract only in Stage 04A — no entitlement behavior is invented;
 * the default implementation reports "unavailable" and authorization
 * fails closed, so no paid module can be enabled by a placeholder.
 */
interface SubscriptionEntitlementGate
{
    public function evaluate(Workspace $workspace, string $moduleId): GateDecision;
}
