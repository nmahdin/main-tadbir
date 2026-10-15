<?php

namespace App\Modules\Projects\Pilot;

use App\Core\Authorization\Contracts\ModuleAvailabilityGate;
use App\Core\Authorization\GateDecision;
use App\Core\Workspaces\Workspace;

/**
 * Pilot module-availability gate: affirms only under the
 * PilotGatePolicy conditions (projects module, explicit opt-in,
 * non-production); otherwise reports unavailable so authorization
 * fails closed. Real module activation replaces it in its own stage.
 */
final class PilotModuleAvailabilityGate implements ModuleAvailabilityGate
{
    public function __construct(private readonly PilotGatePolicy $policy) {}

    public function evaluate(Workspace $workspace, string $moduleId): GateDecision
    {
        return $this->policy->allowsModule($moduleId)
            ? GateDecision::allow()
            : GateDecision::unavailable("Projects pilot gate is inactive for module [{$moduleId}]; module availability cannot be authorized.");
    }
}
