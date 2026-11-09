<?php

namespace App\Core\Organizations;

use App\Core\Audit\AuditWriter;
use App\Core\Platform\PlatformAuthorizer;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Organization lifecycle transitions (Stage C3-1, amended):
 * suspend, reactivate, end, and the distinct restoreEnded
 * operation for terminated organizations. `ended` can never be
 * reached or left through the suspend/reactivate pair.
 *
 * Authorization precondition (Stage C3-2): the actor must be an
 * operationally active platform user whose persisted platform
 * role assignment effectively holds the operation-specific
 * permission, evaluated by PlatformAuthorizer:
 * suspend/reactivate -> `platform.organizations.manage_status`,
 * end -> `platform.organizations.end`, restoreEnded ->
 * `platform.organizations.restore`. Primary Administrator status
 * is not a substitute for permission evaluation (the protected
 * role simply holds all three keys through explicit
 * provisioning), custom platform roles can hold any subset, and
 * legacy admin or organization-owner status confers nothing. A
 * caller-supplied user is evidence only of identity — never of
 * privilege — and no bypass entry point exists.
 *
 * Every transition runs in one transaction under the organization
 * row lock: state, lifecycle metadata, status_version, and the C1
 * audit record (previous/new state, actor, reason) commit or roll
 * back together. The optional expected version provides an
 * explicit stale-state check in addition to the serialized lock.
 */
final class OrganizationLifecycleService
{
    public function __construct(
        private readonly PlatformAuthorizer $platformAuthorizer,
        private readonly AuditWriter $audit,
    ) {}

    /** active -> suspended */
    public function suspend(
        User $actor,
        Organization $organization,
        string $reason,
        ?int $expectedVersion = null,
    ): Organization {
        return $this->transition($actor, $organization, [OrganizationStatus::Active], OrganizationStatus::Suspended, 'platform.organizations.manage_status', 'organization.suspended', $reason, $expectedVersion);
    }

    /** suspended -> active (never valid for `ended`) */
    public function reactivate(
        User $actor,
        Organization $organization,
        string $reason,
        ?int $expectedVersion = null,
    ): Organization {
        return $this->transition($actor, $organization, [OrganizationStatus::Suspended], OrganizationStatus::Active, 'platform.organizations.manage_status', 'organization.reactivated', $reason, $expectedVersion);
    }

    /** active|suspended -> ended */
    public function end(
        User $actor,
        Organization $organization,
        string $reason,
        ?int $expectedVersion = null,
    ): Organization {
        return $this->transition($actor, $organization, [OrganizationStatus::Active, OrganizationStatus::Suspended], OrganizationStatus::Ended, 'platform.organizations.end', 'organization.ended', $reason, $expectedVersion);
    }

    /** ended -> active; the only exit from `ended` */
    public function restoreEnded(
        User $actor,
        Organization $organization,
        string $reason,
        ?int $expectedVersion = null,
    ): Organization {
        return $this->transition($actor, $organization, [OrganizationStatus::Ended], OrganizationStatus::Active, 'platform.organizations.restore', 'organization.restored', $reason, $expectedVersion);
    }

    /**
     * @param  list<OrganizationStatus>  $allowedSources
     */
    private function transition(
        User $actor,
        Organization $organization,
        array $allowedSources,
        OrganizationStatus $target,
        string $permissionKey,
        string $auditAction,
        string $reason,
        ?int $expectedVersion,
    ): Organization {
        if (! $this->platformAuthorizer->allows($actor, $permissionKey)) {
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

        return DB::transaction(function () use ($actor, $organization, $allowedSources, $target, $auditAction, $reason, $expectedVersion): Organization {
            $locked = Organization::whereKey($organization->id)->lockForUpdate()->firstOrFail();
            $previous = OrganizationStatus::of($locked->status);

            if ($expectedVersion !== null && (int) $locked->status_version !== $expectedVersion) {
                throw new OrganizationLifecycleException(
                    'stale_version',
                    'The organization lifecycle state changed concurrently; reload before retrying.',
                );
            }

            if ($previous === null || ! in_array($previous, $allowedSources, true)) {
                throw new OrganizationLifecycleException(
                    'invalid_transition',
                    "An organization cannot transition from [{$locked->status}] to [{$target->value}] with this operation.",
                );
            }

            $locked->forceFill([
                'status' => $target->value,
                ...$this->metadataFor($previous, $target, $actor),
                'status_version' => (int) $locked->status_version + 1,
            ])->save();

            $this->audit->record($actor, $auditAction, [
                'organization_id' => (int) $locked->id,
                'previous_status' => $previous->value,
                'new_status' => $target->value,
                'reason' => $reason,
                'status_version' => (int) $locked->status_version,
            ], 'organization', (int) $locked->id, 'organization', (int) $locked->id);

            return $locked->refresh();
        });
    }

    /**
     * Current-state lifecycle metadata for a transition. Full
     * history (including each reason) lives in the audit log;
     * these columns describe only the present state.
     *
     * @return array<string, mixed>
     */
    private function metadataFor(OrganizationStatus $previous, OrganizationStatus $target, User $actor): array
    {
        return match ($target) {
            OrganizationStatus::Suspended => [
                'suspended_at' => now(),
                'suspended_by_user_id' => $actor->id,
            ],
            OrganizationStatus::Ended => [
                'ended_at' => now(),
                'ended_by_user_id' => $actor->id,
            ],
            OrganizationStatus::Active => $previous === OrganizationStatus::Ended
                ? ['suspended_at' => null, 'suspended_by_user_id' => null, 'ended_at' => null, 'ended_by_user_id' => null]
                : ['suspended_at' => null, 'suspended_by_user_id' => null],
        };
    }
}
