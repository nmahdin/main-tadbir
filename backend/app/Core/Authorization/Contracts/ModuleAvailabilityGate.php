<?php

namespace App\Core\Authorization\Contracts;

use App\Core\Authorization\GateDecision;
use App\Core\Workspaces\Workspace;

/**
 * Whether a business module is activated for a workspace (Stage 07
 * module-activation slice). Stage 04A defines the contract only; the
 * default implementation reports "unavailable" and the central
 * authorization service fails closed on that.
 */
interface ModuleAvailabilityGate
{
    public function evaluate(Workspace $workspace, string $moduleId): GateDecision;
}
