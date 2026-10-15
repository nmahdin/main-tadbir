<?php

namespace App\Modules\Projects\Pilot;

use App\Modules\Projects\ProjectsModule;
use Illuminate\Support\Facades\App;

/**
 * Stage 04B pilot gate policy — the explicit, narrowly scoped answer
 * to "gates are not built yet, but workspace-scoped Projects traffic
 * must not silently bypass them".
 *
 * The pilot affirms the central gates only when ALL conditions hold:
 *  1. the module being authorized is `projects` (any other module id
 *     is refused — this policy never grants anything for anyone else);
 *  2. `projects.workspace_pilot.enabled` is explicitly on
 *     (PROJECTS_WORKSPACE_PILOT env opt-in, default off);
 *  3. the application environment is NOT `production`.
 *
 * Otherwise every pilot gate reports "unavailable", the exact state
 * of an unimplemented gate, and the central service fails closed with
 * 403. Conditions are evaluated per call, so changing configuration
 * or environment changes the decision immediately. The policy invents
 * no subscription or module-activation semantics (Q-01 OPEN): it is a
 * development-stage allowance with a hard production stop, to be
 * deleted when the real gate implementations land.
 */
final class PilotGatePolicy
{
    public function allowsModule(string $moduleId): bool
    {
        return $moduleId === ProjectsModule::ID && $this->pilotIsActive();
    }

    public function allowsPermission(string $permissionKey): bool
    {
        return in_array($permissionKey, ProjectsModule::PERMISSIONS, true) && $this->pilotIsActive();
    }

    private function pilotIsActive(): bool
    {
        return (bool) config('projects.workspace_pilot.enabled', false)
            && ! App::environment('production');
    }
}
