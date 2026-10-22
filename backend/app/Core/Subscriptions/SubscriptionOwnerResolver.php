<?php

namespace App\Core\Subscriptions;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;

/**
 * Canonical subscription-owner resolution (Stage C5-2).
 *
 * Ownership is resolved ONLY from persisted records: an
 * organization-owned workspace's subscription belongs to its
 * organization (never to a personal workspace, never to a
 * membership the user happens to hold elsewhere); a personal
 * workspace's subscription belongs to itself. Client- or
 * payload-supplied ownership claims are never trusted — code that
 * receives a subscription reference from outside must pass it
 * through assertBelongsToWorkspace(), the same discipline as the
 * C3 organization execution guard.
 */
final class SubscriptionOwnerResolver
{
    public function ownerForWorkspace(Workspace $workspace): SubscriptionOwner
    {
        if ($workspace->organization_id !== null) {
            $organization = Organization::query()->find($workspace->organization_id);

            if ($organization === null) {
                throw new SubscriptionException(
                    'subscription_owner_invalid',
                    'The workspace references a missing organization; ownership cannot be resolved.',
                );
            }

            return new SubscriptionOwner('organization', $organization, null);
        }

        if (! $workspace->isPersonal()) {
            throw new SubscriptionException(
                'subscription_owner_invalid',
                'The workspace is neither organization-owned nor a personal workspace.',
            );
        }

        return new SubscriptionOwner('personal', null, $workspace);
    }

    public function subscriptionForWorkspace(Workspace $workspace): ?CoreSubscription
    {
        $owner = $this->ownerForWorkspace($workspace);

        return $owner->type === 'organization'
            ? $this->subscriptionForOrganization($owner->organization)
            : $this->subscriptionForPersonalWorkspace($owner->personalWorkspace);
    }

    public function subscriptionForOrganization(Organization $organization): ?CoreSubscription
    {
        return CoreSubscription::query()
            ->where('organization_id', $organization->id)
            ->first();
    }

    public function subscriptionForPersonalWorkspace(Workspace $workspace): ?CoreSubscription
    {
        if ($workspace->organization_id !== null || ! $workspace->isPersonal()) {
            throw new SubscriptionException(
                'subscription_owner_invalid',
                'A personal subscription can only belong to a real personal workspace.',
            );
        }

        return CoreSubscription::query()
            ->where('personal_workspace_id', $workspace->id)
            ->first();
    }

    /**
     * Reject a subscription that does not belong to the workspace's
     * persisted owner (cross-scope claim).
     */
    public function assertBelongsToWorkspace(CoreSubscription $subscription, Workspace $workspace): void
    {
        $owner = $this->ownerForWorkspace($workspace);

        if ($subscription->ownerKey() !== $owner->key()) {
            throw new SubscriptionException(
                'subscription_owner_mismatch',
                'The subscription does not belong to this workspace\'s owner.',
            );
        }
    }
}
