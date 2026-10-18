<?php

namespace App\Core\Invitations;

use App\Core\Organizations\Organization;
use App\Core\Rbac\ScopedRole;
use App\Core\Settings\SettingValueStore;
use Carbon\CarbonImmutable;

/**
 * Builds the public InvitationPresentation (Stage C6-1).
 *
 * Read-only and side-effect free: presenting an invitation never
 * consumes it and never reveals anything beyond the presentation
 * contract (see InvitationPresentation). Display metadata is
 * allowlisted: organization description/logo come from the
 * canonical public settings (Stage C7-2) with the owner's legacy
 * explicitly-public `settings.public` block as frozen fallback;
 * private settings never surface. The inviter is represented by
 * display name only — no user identifiers.
 */
final class InvitationPresenter
{
    public function __construct(
        private readonly ?SettingValueStore $settings = null,
    ) {}

    public function present(CoreInvitation $invitation, ?CarbonImmutable $now = null): InvitationPresentation
    {
        $now ??= CarbonImmutable::now('UTC');
        $organization = $invitation->organization()->first();
        $workspace = $invitation->workspace()->first();

        // For workspace invitations the organization is not a
        // stored invitation target; display its public identity
        // from the persisted workspace owner when it exists.
        if ($organization === null && $workspace !== null && $workspace->organization_id !== null) {
            $organization = $workspace->organization()->first();
        }

        return new InvitationPresentation(
            [
                'type' => $invitation->type,
                'status' => $invitation->effectiveState($now)->value,
                'expires_at' => $invitation->expires_at->toIso8601String(),
                'will_create_organization_membership' => $invitation->willCreateOrganizationMembership(),
            ],
            $organization === null ? null : [
                'name' => $organization->name,
                'description' => $this->publicMetadata($organization, 'organization.public.description', 'description'),
                'logo_url' => $this->publicMetadata($organization, 'organization.public.logo_url', 'logo_url'),
            ],
            $workspace === null ? null : [
                'name' => $workspace->name,
                'description' => null,
            ],
            ($inviter = $invitation->invitedBy()->first()) === null ? null : [
                'name' => $inviter->name,
            ],
            $this->rolePresentation($invitation->intendedOrganizationRole()->first(), 'organization'),
            $this->rolePresentation($invitation->intendedWorkspaceRole()->first(), 'workspace'),
            $invitation->message !== null ? trim(strip_tags($invitation->message)) : null,
        );
    }

    /**
     * @return array{name: string, scope: string, summary: string}|null
     */
    private function rolePresentation(?ScopedRole $role, string $scope): ?array
    {
        if ($role === null) {
            return null;
        }

        return [
            'name' => $role->name,
            'scope' => $scope,
            'summary' => $scope === 'organization'
                ? 'Membership of the organization with the '.$role->name.' role.'
                : 'Membership of the workspace with the '.$role->name.' role.',
        ];
    }

    /**
     * Public display metadata (Stage C7-2 transition): the
     * canonical settings store wins — including an explicit null,
     * which means "intentionally cleared" and suppresses fallback;
     * when no canonical row exists, the frozen legacy
     * `settings.public` value is read (backward compatibility with
     * pre-C7 data). Identical precedence to the effective-settings
     * resolver, so C6 presentation and approved C7 writes cannot
     * silently diverge. Only the two approved public keys are ever
     * read; private settings never surface.
     */
    private function publicMetadata(Organization $organization, string $canonicalKey, string $legacyKey): ?string
    {
        if ($this->settings !== null) {
            $stored = $this->settings->get('organization', (int) $organization->id, $canonicalKey);
            if ($stored->exists) {
                return is_string($stored->value) && trim($stored->value) !== '' ? trim($stored->value) : null;
            }
        }

        return $this->publicSetting($organization->settings, $legacyKey);
    }

    /**
     * @param  mixed  $settings
     */
    private function publicSetting($settings, string $key): ?string
    {
        if (! is_array($settings)) {
            return null;
        }

        $public = $settings['public'] ?? null;

        if (! is_array($public)) {
            return null;
        }

        $value = $public[$key] ?? null;

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
