<?php

namespace App\Core\Subscriptions;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;

/**
 * The resolved subscription owner for a workspace (Stage C5-2):
 * exactly one of an organization or the personal workspace itself.
 */
final readonly class SubscriptionOwner
{
    public function __construct(
        public string $type, // 'organization' | 'personal'
        public ?Organization $organization,
        public ?Workspace $personalWorkspace,
    ) {}

    public function key(): string
    {
        return $this->type === 'organization'
            ? 'org:'.(int) $this->organization->id
            : 'ws:'.(int) $this->personalWorkspace->id;
    }

    public function id(): int
    {
        return $this->type === 'organization'
            ? (int) $this->organization->id
            : (int) $this->personalWorkspace->id;
    }
}
