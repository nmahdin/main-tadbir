<?php

namespace App\Core\Identity;

use App\Core\Audit\AuditWriter;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Core v1 account lifecycle transitions (Stage C1).
 *
 * Legacy statuses keep their semantics and stay manageable through
 * the existing user-administration endpoint; this service owns the
 * new transitions only:
 *  - suspend:   active/inactive/blocked → suspended. Reversible.
 *               Authentication tokens are revoked; memberships are
 *               preserved (access is denied by status everywhere).
 *  - restore:   suspended → active. Memberships were never ended,
 *               so nothing is resurrected implicitly.
 *  - deactivate: any non-deactivated status → deactivated. Terminal.
 *               Tokens revoked and every live Core membership ended
 *               in the same transaction; each membership's own
 *               final-manager guard runs (Stage 03B), so a user who
 *               is the final manager of any organization or
 *               workspace cannot be deactivated until a successor
 *               exists — the whole transition rolls back instead of
 *               orphaning the scope. Historical rows (memberships,
 *               authored records, ownership references) are
 *               preserved; accounts are never deleted here.
 *
 * Every transition writes its audit record inside the same
 * transaction, so mutation and audit commit or roll back together.
 */
final class AccountLifecycle
{
    public function __construct(private readonly AuditWriter $audit) {}

    public function suspend(User $actor, User $user, ?string $reason = null): User
    {
        return $this->transition($actor, $user, AccountStatus::Suspended, 'identity.account_suspended', $reason, function (User $locked): void {
            $locked->tokens()->delete();
        });
    }

    public function restore(User $actor, User $user): User
    {
        return $this->transition($actor, $user, AccountStatus::Active, 'identity.account_restored', null, function (User $locked): void {
            // Restore intentionally has no side effects: suspension
            // never ended memberships or ownership.
        });
    }

    public function deactivate(User $actor, User $user, ?string $reason = null): User
    {
        return $this->transition($actor, $user, AccountStatus::Deactivated, 'identity.account_deactivated', $reason, function (User $locked): void {
            $locked->tokens()->delete();
            $this->endLiveMemberships($locked);
        });
    }

    private function transition(User $actor, User $user, AccountStatus $target, string $action, ?string $reason, callable $sideEffects): User
    {
        return DB::transaction(function () use ($actor, $user, $target, $action, $reason, $sideEffects): User {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $current = AccountStatus::of($locked->status);

            $this->assertTransitionAllowed($current, $target);

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
            AccountStatus::Suspended => in_array($current, [AccountStatus::Active, AccountStatus::Inactive, AccountStatus::Blocked], true),
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
