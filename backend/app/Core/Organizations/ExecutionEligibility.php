<?php

namespace App\Core\Organizations;

/**
 * Whether organization/workspace-owned background work may run
 * (Stage C3-3).
 *
 *  - Executable: run normally (active organization, or a
 *    personal/global operation with no organization scope).
 *  - Paused (suspended organization): do not execute now, but do
 *    not treat the work as failed either. Pending work is
 *    preserved; after reactivation the owning module may run
 *    only items that are still eligible and unexpired under its
 *    own business rules — never an indiscriminate backlog replay.
 *  - Terminated (ended organization): do not execute. Work that
 *    predates termination is permanently ineligible for automatic
 *    execution; the special restoration never replays it. Only
 *    newly scheduled post-restoration work may run, through the
 *    normal authorization and scheduling rules.
 */
enum ExecutionEligibility
{
    case Executable;
    case Paused;
    case Terminated;

    public function isExecutable(): bool
    {
        return $this === self::Executable;
    }
}
