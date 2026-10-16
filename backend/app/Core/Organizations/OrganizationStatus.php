<?php

namespace App\Core\Organizations;

/**
 * The complete organization lifecycle state set (Stage C3-1).
 * Suspension is reversible and non-destructive: organizations,
 * workspaces, memberships, roles, and operational records remain
 * intact while access is denied.
 */
enum OrganizationStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';

    public static function of(?string $status): ?self
    {
        return $status === null ? null : self::tryFrom($status);
    }

    public function allowsOperationalAccess(): bool
    {
        return $this === self::Active;
    }

    public function auditAction(): string
    {
        return $this === self::Suspended ? 'organization.suspended' : 'organization.reactivated';
    }
}
