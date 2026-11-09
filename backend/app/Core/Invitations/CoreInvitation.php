<?php

namespace App\Core\Invitations;

use App\Core\Organizations\Organization;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\Workspace;
use App\Models\User;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A persisted invitation (Stage C6-1, amended C6 contract).
 *
 * Three intents, each with its own scope/role shape (mirrored by
 * MySQL CHECKs; this guard keeps SQLite and direct model writes
 * honest):
 *  - organization: organization target + organization role intent;
 *  - workspace: workspace target + workspace role intent (owning
 *    organization is NOT stored separately: it always derives
 *    from the persisted workspace at acceptance time);
 *  - combined: organization-owned workspace target + the owning
 *    organization target + BOTH role intents. For combined, the
 *    stored organization must be the workspace's persisted owner
 *    (enforced in the service at issuance and revalidated in C6-2).
 *
 * Role intent and message are immutable once issued: corrections
 * are made by revoking and reissuing, so C6-2 revalidates exactly
 * what was authorized at issue time. If the invited user already
 * holds organization membership at acceptance, their existing
 * organization role is preserved (C6-2 contract) — the stored
 * organization role intent then does not replace it.
 */
class CoreInvitation extends Model
{
    public const TYPE_ORGANIZATION = 'organization';

    public const TYPE_WORKSPACE = 'workspace';

    public const TYPE_COMBINED = 'combined';

    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REVOKED = 'revoked';

    public const MESSAGE_MAX_LENGTH = 1000;

    protected $table = 'core_invitations';

    protected $fillable = [
        'type', 'organization_id', 'workspace_id', 'email_normalized',
        'token_hash', 'status', 'intended_organization_role_id',
        'intended_workspace_role_id', 'invited_by_user_id', 'message',
        'expires_at', 'accepted_at', 'accepted_by_user_id',
        'revoked_at', 'revoked_by_user_id', 'status_version',
    ];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $invitation): void {
            $shapeMatches = match ($invitation->type) {
                self::TYPE_ORGANIZATION => $invitation->organization_id !== null && $invitation->workspace_id === null
                    && $invitation->intended_organization_role_id !== null && $invitation->intended_workspace_role_id === null,
                self::TYPE_WORKSPACE => $invitation->workspace_id !== null && $invitation->organization_id === null
                    && $invitation->intended_workspace_role_id !== null && $invitation->intended_organization_role_id === null,
                self::TYPE_COMBINED => $invitation->organization_id !== null && $invitation->workspace_id !== null
                    && $invitation->intended_organization_role_id !== null && $invitation->intended_workspace_role_id !== null,
                default => false,
            };

            if (! $shapeMatches) {
                throw new DomainException('An invitation must match the scope and role-intent shape of its type.');
            }

            if (! in_array($invitation->status, [self::STATUS_PENDING, self::STATUS_ACCEPTED, self::STATUS_REVOKED], true)) {
                throw new DomainException('An invitation status must be pending, accepted, or revoked.');
            }

            if ($invitation->message !== null && mb_strlen($invitation->message) > self::MESSAGE_MAX_LENGTH) {
                throw new DomainException('An invitation message may not exceed '.self::MESSAGE_MAX_LENGTH.' characters.');
            }
        });

        // Scope, intent, inviter, message, and expiry are immutable.
        static::updating(function (self $invitation): void {
            if ($invitation->isDirty(['type', 'organization_id', 'workspace_id', 'email_normalized', 'token_hash', 'intended_organization_role_id', 'intended_workspace_role_id', 'invited_by_user_id', 'message', 'expires_at'])) {
                throw new DomainException('Invitation scope, email, token, role intent, inviter, message, and expiry are immutable once issued.');
            }
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function intendedOrganizationRole(): BelongsTo
    {
        return $this->belongsTo(ScopedRole::class, 'intended_organization_role_id');
    }

    public function intendedWorkspaceRole(): BelongsTo
    {
        return $this->belongsTo(ScopedRole::class, 'intended_workspace_role_id');
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    /**
     * Deterministic effective state at an instant (UTC). Revocation
     * and acceptance are terminal and take precedence over expiry.
     */
    public function effectiveState(?CarbonImmutable $now = null): InvitationState
    {
        $now ??= CarbonImmutable::now('UTC');

        return match ($this->status) {
            self::STATUS_ACCEPTED => InvitationState::Accepted,
            self::STATUS_REVOKED => InvitationState::Revoked,
            default => CarbonImmutable::instance($this->expires_at)->gt($now)
                ? InvitationState::PendingAcceptance
                : InvitationState::Expired,
        };
    }

    /**
     * Acceptance requires now < expires_at: at the exact expiry
     * instant the invitation is already ineligible.
     */
    public function isAcceptanceEligible(?CarbonImmutable $now = null): bool
    {
        return $this->effectiveState($now) === InvitationState::PendingAcceptance;
    }

    /**
     * Whether acceptance will create an organization membership
     * when the invitee does not already hold one.
     */
    public function willCreateOrganizationMembership(): bool
    {
        return $this->type === self::TYPE_ORGANIZATION || $this->type === self::TYPE_COMBINED;
    }

    public function isOrganizationScoped(): bool
    {
        return $this->type === self::TYPE_ORGANIZATION;
    }
}
