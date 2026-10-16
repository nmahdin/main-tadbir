<?php

namespace App\Core\Organizations;

use App\Core\Audit\AuditWriter;
use App\Core\Platform\PlatformAuthorizer;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Organization suspend/reactivate transitions (Stage C3-1).
 *
 * Authorization precondition: until the dedicated C3-2 platform
 * permission is provisioned, only a verified Primary Administrator
 * (as evaluated from persisted platform assignments by
 * PlatformAuthorizer) may invoke these operations. An arbitrary
 * caller-supplied user, an organization manager, and a Legacy
 * Admin all fail closed. C3-2 will replace this precondition with
 * its dedicated permission without changing the transition rules.
 *
 * Every transition runs in one transaction under the organization
 * row lock: state, suspension metadata, status_version, and the
 * C1 audit record commit or roll back together. The optional
 * expected version provides an explicit stale-state check in
 * addition to the serialized row lock.
 */
final class OrganizationLifecycleService
{
    public function __construct(
        private readonly PlatformAuthorizer $platformAuthorizer,
        private readonly AuditWriter $audit,
    ) {}

    public function suspend(
        User $actor,
        Organization $organization,
        string $reason,
        ?int $expectedVersion = null,
    ): Organization {
        return $this->transition(
            $actor,
            $organization,
            OrganizationStatus::Suspended,
            $reason,
            $expectedVersion,
        );
    }

    public function reactivate(
        User $actor,
        Organization $organization,
        string $reason,
        ?int $expectedVersion = null,
    ): Organization {
        return $this->transition(
            $actor,
            $organization,
            OrganizationStatus::Active,
            $reason,
            $expectedVersion,
        );
    }

    private function transition(
        User $actor,
        Organization $organization,
        OrganizationStatus $target,
        string $reason,
        ?int $expectedVersion,
    ): Organization {
        if (! $this->platformAuthorizer->isPrimaryAdministrator($actor)) {
            throw new OrganizationLifecycleException(
                'platform_authority_required',
                'Organization lifecycle changes require an authorized Platform administrator.',
            );
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw new OrganizationLifecycleException(
                'reason_required',
                'A non-empty reason is required for an organization lifecycle change.',
            );
        }

        return DB::transaction(function () use ($actor, $organization, $target, $reason, $expectedVersion): Organization {
            $locked = Organization::whereKey($organization->id)->lockForUpdate()->firstOrFail();
            $previous = OrganizationStatus::of($locked->status);

            if ($expectedVersion !== null && (int) $locked->status_version !== $expectedVersion) {
                throw new OrganizationLifecycleException(
                    'stale_version',
                    'The organization lifecycle state changed concurrently; reload before retrying.',
                );
            }

            if ($previous === null || $previous === $target) {
                throw new OrganizationLifecycleException(
                    'invalid_transition',
                    "An organization cannot transition from [{$locked->status}] to [{$target->value}].",
                );
            }

            $locked->forceFill([
                'status' => $target->value,
                'suspended_at' => $target === OrganizationStatus::Suspended ? now() : null,
                'suspended_by_user_id' => $target === OrganizationStatus::Suspended ? $actor->id : null,
                'status_version' => (int) $locked->status_version + 1,
            ])->save();

            $this->audit->record($actor, $target->auditAction(), [
                'organization_id' => (int) $locked->id,
                'previous_status' => $previous->value,
                'new_status' => $target->value,
                'reason' => $reason,
                'status_version' => (int) $locked->status_version,
            ], 'organization', (int) $locked->id, 'organization', (int) $locked->id);

            return $locked->refresh();
        });
    }
}
