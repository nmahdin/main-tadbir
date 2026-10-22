<?php

namespace App\Core\Platform;

/**
 * The single serialization point for platform administration
 * (Stage C2-2). Every mutating platform operation — assignment
 * grant/revoke/replace, role management, and the platform guard
 * inside account lifecycle transitions — locks the singleton
 * control row FIRST (before user/role/scope rows), giving one
 * global lock order:
 *
 *   legacy admin role row (lifecycle/legacy paths only)
 *   → platform control row
 *   → user row
 *   → role rows / scope containers
 *
 * Platform services never take the legacy admin lock, and legacy
 * paths never wait on platform state before the control row, so no
 * lock-ordering cycle exists.
 */
final class PlatformControlLock
{
    public function lock(): PlatformAdministrationControl
    {
        return PlatformAdministrationControl::whereKey(1)->lockForUpdate()->firstOrFail();
    }
}
