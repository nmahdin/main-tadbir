<?php

namespace App\Core\Platform;

use App\Core\Rbac\RbacValidationException;
use App\Models\User;

/**
 * Final eligible Primary Administrator guard (Stage C2-2).
 *
 * A "usable" primary is an operationally active account holding an
 * unrevoked `primary_administrator` assignment. Normal operations —
 * assignment revoke/replace and account suspend/deactivate — may
 * not remove the last usable primary. Callers must already hold
 * the PlatformControlLock so the count cannot race.
 */
final class PlatformPrimaryGuard
{
    /**
     * @throws RbacValidationException when $user is the last usable primary
     */
    public function assertNotLastUsablePrimary(User $user): void
    {
        $primaryRoleId = PlatformRole::where('key', PlatformRoleProvisioner::PRIMARY_ROLE_KEY)->value('id');
        if ($primaryRoleId === null) {
            return;
        }

        $holdsPrimary = PlatformRoleAssignment::query()
            ->where('user_id', $user->id)
            ->where('platform_role_id', $primaryRoleId)
            ->whereNull('revoked_at')
            ->exists();
        if (! $holdsPrimary) {
            return;
        }

        $otherUsablePrimaries = PlatformRoleAssignment::query()
            ->where('platform_role_id', $primaryRoleId)
            ->whereNull('revoked_at')
            ->where('user_id', '!=', $user->id)
            ->whereHas('user', fn ($query) => $query->where('status', 'active'))
            ->count();

        if ($otherUsablePrimaries === 0) {
            throw new RbacValidationException(
                'The last usable Primary Administrator cannot lose that role through normal operations.',
            );
        }
    }
}
