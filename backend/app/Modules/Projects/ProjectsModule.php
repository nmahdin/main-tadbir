<?php

namespace App\Modules\Projects;

use App\Core\Modules\ModuleManifest;

/**
 * Projects module manifest (Stage 04B pilot).
 *
 * Declares the module's stable id and the permission keys it owns in
 * the Core catalog. Following the Stage 02 registration contract, the
 * manifest is intentionally not registered in ModuleServiceProvider
 * yet: registration lands with the module's own service wiring so the
 * registry never becomes a parallel source of truth mid-pilot.
 */
final class ProjectsModule
{
    public static function manifest(): ModuleManifest
    {
        return new ModuleManifest(
            id: 'projects',
            permissions: ['projects.view', 'projects.create', 'projects.edit', 'projects.delete'],
        );
    }
}
