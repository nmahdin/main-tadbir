<?php

namespace App\Modules\Reference;

use App\Core\Modules\ModuleManifest;

/**
 * Reference fixture module (Stage 02).
 *
 * This module has no routes, tables or behavior. It exists so that the
 * module registration contract and the architecture boundary rules have a
 * real, tested example to bind to. It is intentionally NOT registered by
 * ModuleServiceProvider; tests register it explicitly. Real modules copy
 * this shape when they migrate in Stage 05, then delete their legacy zone.
 *
 * Public contract of a module (see docs/PROJECT_STRUCTURE.md): only this
 * manifest provider and a future Contracts/ namespace may be used by other
 * modules. Everything else in the module folder is internal.
 */
final class ReferenceModule
{
    public static function manifest(): ModuleManifest
    {
        return new ModuleManifest(
            id: 'reference',
            permissions: [],
        );
    }
}
