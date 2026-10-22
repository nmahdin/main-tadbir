<?php

namespace App\Core\Organizations;

/**
 * The complete organization lifecycle state set (Stage C3-1,
 * amended to three states).
 *
 *  - active:    operational;
 *  - suspended: temporarily frozen, reversible by reactivation;
 *  - ended:     logical business termination (soft-delete-like in
 *               effect, but deliberately not Laravel SoftDeletes);
 *               restorable only through the dedicated
 *               restoreEnded operation, never ordinary
 *               reactivation.
 *
 * Every state preserves all organization, workspace, membership,
 * role, and operational records.
 */
enum OrganizationStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';
    case Ended = 'ended';

    public static function of(?string $status): ?self
    {
        return $status === null ? null : self::tryFrom($status);
    }

    public function allowsOperationalAccess(): bool
    {
        return $this === self::Active;
    }
}
