<?php

namespace App\Core\Invitations;

/**
 * Safe, read-only public presentation of an invitation
 * (Stage C6-1 contract for the C6-3 preview endpoint and the
 * C6-4 invitation page).
 *
 * Privacy contract: this DTO contains NO internal identifiers,
 * NO email, NO token (raw or hashed), NO membership rosters, NO
 * private organization/workspace settings, NO audit data, and NO
 * authorization internals. Organization/workspace description and
 * logo surface ONLY when explicitly published by the owner under
 * `settings.public` (approved public metadata); everything else
 * about the scope stays private. Role exposure is limited to the
 * intended roles' display names and human-readable summaries.
 *
 * The invitation URL itself is sensitive: consumers must render
 * this page with no-referrer/no-store protections and must never
 * put the token-bearing URL into analytics, logs, or third-party
 * requests. Opening the page never consumes the invitation.
 */
final readonly class InvitationPresentation
{
    /**
     * @param  array{type: string, status: string, expires_at: string, will_create_organization_membership: bool}  $invitation
     * @param  array{name: string, description: ?string, logo_url: ?string}|null  $organization
     * @param  array{name: string, description: ?string}|null  $workspace
     * @param  array{name: string}|null  $inviter
     * @param  array{name: string, scope: string, summary: string}|null  $intendedOrganizationRole
     * @param  array{name: string, scope: string, summary: string}|null  $intendedWorkspaceRole
     */
    public function __construct(
        public array $invitation,
        public ?array $organization,
        public ?array $workspace,
        public ?array $inviter,
        public ?array $intendedOrganizationRole,
        public ?array $intendedWorkspaceRole,
        public ?string $message,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'invitation' => $this->invitation,
            'organization' => $this->organization,
            'workspace' => $this->workspace,
            'inviter' => $this->inviter,
            'intended_organization_role' => $this->intendedOrganizationRole,
            'intended_workspace_role' => $this->intendedWorkspaceRole,
            'message' => $this->message,
        ];
    }
}
