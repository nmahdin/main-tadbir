<?php

namespace App\Core\Plans;

/**
 * Runtime module access levels the C5-3 entitlement engine must
 * distinguish (contract defined in C5-1; evaluation lands in C5-3).
 *
 *  - Full: subscription in force; read+write allowed (subject to
 *    RBAC, activation, availability, organization lifecycle).
 *  - Grace: past expiry but inside the version's grace window;
 *    full access continues.
 *  - ReadOnly: expired beyond grace; previously eligible, enabled
 *    modules remain readable, writes denied. Data is preserved.
 *  - Denied: no entitlement, expired without eligibility, or the
 *    module is not enabled — no operational access.
 *
 * A plan merely ALLOWING a module implies none of: technical
 * availability, workspace activation, or user RBAC authorization.
 * Activation eligibility (WorkspaceModuleService via C4) is a
 * separate check from runtime read/write eligibility and remains
 * governed by the C4 entitlement gate until C5-3 rewires it.
 */
enum ModuleAccessLevel: string
{
    case Full = 'full';
    case Grace = 'grace';
    case ReadOnly = 'read_only';
    case Denied = 'denied';

    public function allowsRead(): bool
    {
        return $this !== self::Denied;
    }

    public function allowsWrite(): bool
    {
        return $this === self::Full || $this === self::Grace;
    }
}
