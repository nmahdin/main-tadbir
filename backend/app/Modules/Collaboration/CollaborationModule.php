<?php

namespace App\Modules\Collaboration;

use App\Core\Modules\ModuleManifest;

/**
 * Collaboration module manifest (ARCH-02 legacy-plane modularization).
 *
 * The legacy workspace plane was mechanically relocated into domain
 * modules without behavior changes. Permission ownership stays in
 * the Core catalog (legacy PermissionSeeder / C1 catalog); this
 * manifest intentionally declares no new permission keys.
 */
final class CollaborationModule
{
    public const ID = 'collaboration';

    public static function manifest(): ModuleManifest
    {
        return new ModuleManifest(
            id: self::ID,
            permissions: [],
        );
    }
}
