<?php

namespace App\Core\Authorization;

use App\Core\Authorization\Contracts\ModuleAvailabilityGate;
use App\Core\Workspaces\Workspace;

/**
 * Default Stage 04A implementation: module activation does not exist
 * yet, so the gate honestly reports unavailable (authorization then
 * fails closed). Replaced in the Stage 07 module-activation slice.
 */
final class UnimplementedModuleAvailabilityGate implements ModuleAvailabilityGate
{
    public function evaluate(Workspace $workspace, string $moduleId): GateDecision
    {
        return GateDecision::unavailable("Module availability gate is not implemented; module [{$moduleId}] cannot be authorized.");
    }
}
