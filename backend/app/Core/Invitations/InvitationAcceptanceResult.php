<?php

namespace App\Core\Invitations;

/**
 * The committed outcome of a successful invitation acceptance
 * (Stage C6-2) — enough for the C6-3 API / C6-4 page to navigate
 * to the intended organization or workspace after normal
 * authorization. It contains no tokens and no other accounts'
 * data.
 */
final readonly class InvitationAcceptanceResult
{
    public function __construct(
        public int $invitationId,
        public string $type,
        public ?int $organizationId,
        public ?int $workspaceId,
        public bool $createdOrganizationMembership,
        public bool $createdWorkspaceMembership,
        public bool $preservedExistingOrganizationRole,
        public bool $preservedExistingWorkspaceRole,
    ) {}

    /**
     * The scope the UI should navigate to first (workspace wins:
     * it is always the operational destination when present).
     *
     * @return array{type: string, id: int}|null
     */
    public function navigationTarget(): ?array
    {
        if ($this->workspaceId !== null) {
            return ['type' => 'workspace', 'id' => $this->workspaceId];
        }

        if ($this->organizationId !== null) {
            return ['type' => 'organization', 'id' => $this->organizationId];
        }

        return null;
    }
}
