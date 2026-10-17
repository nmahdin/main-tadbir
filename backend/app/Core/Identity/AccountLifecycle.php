<?php

namespace App\Core\Identity;

use App\Core\Audit\AuditWriter;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Platform\PlatformControlLock;
use App\Core\Platform\PlatformPrimaryGuard;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use App\Services\Access\AccessAdministration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Core v1 account lifecycle transitions (Stage C1).
 *
 * Legacy statuses keep their semantics and stay manageable through
 * the existing user-administration endpoint; this service owns the
 * new transitions only:
 *  - suspend:   active → suspended only (hardening rule: suspending
 *               a blocked/inactive account and later restoring it
 *               would silently discard its earlier administrative
 *               status, so those accounts keep their legacy status
 *               until an administrator changes it through the legacy
 *               path). Reversible. Authentication tokens and web
 *               sessions are revoked; memberships are preserved
 *               (access is denied by status everywhere).
 *  - restore:   suspended → active. Memberships were never ended,
 *               so nothing is resurrected implicitly. Revoked
 *               sessions/tokens are NOT resurrected either.
 *  - deactivate: any non-deactivated status → deactivated. Terminal.
 *               Tokens and web sessions revoked and every live Core
 *               membership ended in the same transaction; each
 *               membership's own final-manager guard runs
 *               (Stage 03B), so a user who is the final manager of
 *               any organization or workspace cannot be deactivated
 *               until a successor exists — the whole transition
 *               rolls back instead of orphaning the scope.
 *               Historical rows (memberships, authored records,
 *               ownership references) are preserved; accounts are
 *               never deleted here.
 *
 * Suspension and deactivation also enforce the legacy
 * last-active-system-admin invariant (AccessAdministration): the
 * admin role row is locked before the user row — the established
 * protocol shared with user update/delete — and the transition
 * aborts (422, full rollback) when the target is the final active
 * legacy administrator, including self-targeting.
 *
 * Every transition writes its audit record inside the same
 * transaction, so mutation and audit commit or roll back together.
 */
final class AccountLifecycle
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly AccessAdministration $access,
        private readonly PlatformControlLock $platformLock,
        private readonly PlatformPrimaryGuard $primaryGuard,
    ) {}

    public function suspend(User $actor, User $user, ?string $reason = null): User
    {
        return $this->transition($actor, $user, AccountStatus::Suspended, 'identity.account_suspended', $reason, function (User $locked): void {
            $locked->tokens()->delete();
            $this->revokeWebSessions($locked);
        });
    }

    public function restore(User $actor, User $user): User
    {
        return $this->transition($actor, $user, AccountStatus::Active, 'identity.account_restored', null, function (User $locked): void {
            // Restore intentionally has no side effects: suspension
            // never ended memberships or ownership, and revoked
            // sessions/tokens stay revoked (fresh login required).
        });
    }

    public function deactivate(User $actor, User $user, ?string $reason = null): User
    {
        return $this->transition($actor, $user, AccountStatus::Deactivated, 'identity.account_deactivated', $reason, function (User $locked): void {
            $locked->tokens()->delete();
            $this->revokeWebSessions($locked);
            $this->endLiveMemberships($locked);
        });
    }

    private function transition(User $actor, User $user, AccountStatus $target, string $action, ?string $reason, callable $sideEffects): User
    {
        return DB::transaction(function () use ($actor, $user, $target, $action, $reason, $sideEffects): User {
            // Established lock ordering (shared with user update /
            // delete): the admin role row is locked BEFORE any user
            // row, so concurrent administrators cannot race to
            // remove the last active admin. Stage C2-2 extends the
            // order with the platform control row (always after the
            // legacy admin lock, always before the user row), which
            // platform services also take first — no cycle exists.
            $this->access->lockAdminRole();
            $this->platformLock->lock();
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $current = AccountStatus::of($locked->status);

            $this->assertTransitionAllowed($current, $target);

            if (in_array($target, [AccountStatus::Suspended, AccountStatus::Deactivated], true)) {
                // Reuses the legacy invariant verbatim: aborts with
                // 422 (rolling this transaction back) when the
                // target is the final active system administrator.
                $this->access->protectLastAdmin($locked, ['status' => $target->value]);

                // Stage C2-2: the same protection for the final
                // usable Primary Administrator (no-op for users
                // without a primary assignment; evaluated under the
                // platform control lock taken above).
                $this->primaryGuard->assertNotLastUsablePrimary($locked);
            }

            $sideEffects($locked);
            $locked->forceFill(['status' => $target->value])->save();

            $this->audit->record(
                $actor,
                $action,
                ['from' => $current?->value, 'to' => $target->value, 'reason' => $reason],
                'platform',
                null,
                'user',
                (int) $locked->id,
            );

            return $locked->refresh();
        });
    }

    private function assertTransitionAllowed(?AccountStatus $current, AccountStatus $target): void
    {
        $allowed = match ($target) {
            AccountStatus::Suspended => $current === AccountStatus::Active,
            AccountStatus::Active => $current === AccountStatus::Suspended,
            AccountStatus::Deactivated => $current !== null && $current !== AccountStatus::Deactivated,
            default => false,
        };

        if (! $allowed) {
            throw new AccountLifecycleException(
                "Account cannot transition from [{$current?->value}] to [{$target->value}].",
            );
        }
    }

    /**
     * Revoke web authentication state with the application's
     * supported session mechanisms: persisted session rows for this
     * user are removed (database session driver, the application
     * default) and the remember-me token is rotated, which
     * invalidates every outstanding remember cookie. Per-request
     * account-status denial (EnsureActiveAccount) remains in place
     * as defense in depth for non-persistent session drivers.
     */
    private function revokeWebSessions(User $user): void
    {
        $user->forceFill(['remember_token' => Str::random(60)])->save();

        if (Schema::hasTable('sessions')) {
            DB::table('sessions')->where('user_id', $user->id)->delete();
        }
    }

    /**
     * End every live Core membership. Each membership's end() runs
     * its final-manager guard under its scope lock (Stage 03B); any
     * rejection aborts the surrounding transaction, so an account is
     * never half-deactivated.
     */
    private function endLiveMemberships(User $user): void
    {
        WorkspaceMembership::where('user_id', $user->id)
            ->where('status', '!=', MembershipStatus::Ended->value)
            ->orderBy('workspace_id')
            ->each(fn (WorkspaceMembership $membership) => $membership->end());

        OrganizationMembership::where('user_id', $user->id)
            ->where('status', '!=', MembershipStatus::Ended->value)
            ->orderBy('organization_id')
            ->each(fn (OrganizationMembership $membership) => $membership->end());
    }
}
