<?php

namespace App\Core\Memberships;

use DomainException;

/**
 * Shared lifecycle behavior for organization and workspace memberships.
 *
 * Explicit transition methods only; arbitrary status writes through these
 * helpers are rejected if the transition is not allowed. Timestamps are
 * maintained consistently: deactivation stamps deactivated_at, ending
 * stamps ended_at, reactivation clears deactivated_at.
 *
 * @property MembershipStatus $status
 */
trait MembershipLifecycle
{
    public function deactivate(): static
    {
        return $this->transitionTo(MembershipStatus::Deactivated);
    }

    public function reactivate(): static
    {
        return $this->transitionTo(MembershipStatus::Active);
    }

    public function end(): static
    {
        return $this->transitionTo(MembershipStatus::Ended);
    }

    public function transitionTo(MembershipStatus $target): static
    {
        if (! $this->status->canTransitionTo($target)) {
            throw new DomainException(
                "Membership cannot transition from [{$this->status->value}] to [{$target->value}]."
            );
        }

        $this->status = $target;
        $this->deactivated_at = $target === MembershipStatus::Deactivated ? now() : ($target === MembershipStatus::Active ? null : $this->deactivated_at);
        $this->ended_at = $target === MembershipStatus::Ended ? now() : $this->ended_at;
        $this->save();

        return $this;
    }

    public function isActive(): bool
    {
        return $this->status === MembershipStatus::Active;
    }
}
