<?php

namespace App\Core\Rbac;

/**
 * Privilege-escalation ceiling (ADR-0004 §4): nobody may grant a role
 * or permission set that exceeds their own effective authority in the
 * same scope. Checked on every role creation, permission update, and
 * role assignment.
 */
final class GrantCeiling
{
    /**
     * @param  list<string>  $actorPermissionKeys
     * @param  list<string>  $grantedPermissionKeys
     * @throws RbacValidationException when the grant exceeds the actor
     */
    public static function assertWithinCeiling(array $actorPermissionKeys, array $grantedPermissionKeys, string $scopeLabel): void
    {
        $exceeding = array_values(array_diff($grantedPermissionKeys, $actorPermissionKeys));

        if ($exceeding !== []) {
            throw new RbacValidationException(
                "Grant exceeds the actor's own {$scopeLabel} authority: [".implode(', ', $exceeding).'].'
            );
        }
    }
}
