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
 * A persisted invitation (Stage C6-1).
 *
 * Scope invariants (also enforced by MySQL CHECKs; this guard
 * keeps SQLite and direct model writes honest):
 *  - organization invitation: organization_id set, workspace_id null;
 *  - workspace invitation: workspace_id set, organization_id null —
 *    the owning organization, when any, always derives from the
 *    persisted workspace row, never from client input;
 *  - personal-workspace invitations invent no organization.
 *
 * Intended role intent is immutable once issued: corrections are
 * made by revoking and reissuing, so C6-2 acceptance revalidates
 * exactly what was granted at issue time.
 *
 * @mixin \Illuminate\Database\Eloquent\Builder<static>
 */
class CoreInvitation extends Model
{
    public const TYPE_ORGANIZATION = 'organization';

    public const TYPE_WORKSPACE = 'workspace';

    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REVOKED = 'revoked';

    protected $table = 'core_invitations';

    protected $fillable = [
        'type', 'organization_id', 'workspace_id', 'email_normalized',
        'token_hash', 'status', 'intended_role_id', 'invited_by_user_id',
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
            $scopeMatches = match ($invitation->type) {
                self::TYPE_ORGANIZATION => $invitation->organization_id !== null && $invitation->workspace_id === null,
                self::TYPE_WORKSPACE => $invitation->workspace_id !== null && $invitation->organization_id === null,
                default => false,
            };

            if (! $scopeMatches) {
                throw new DomainException('An invitation must identify exactly one scope: an organization or a workspace.');
            }

            if (! in_array($invitation->status, [self::STATUS_PENDING, self::STATUS_ACCEPTED, self::STATUS_REVOKED], true)) {
                throw new DomainException('An invitation status must be pending, accepted, or revoked.');
            }
        });

        // Role intent is immutable after issuance.
        static::updating(function (self $invitation): void {
            if ($invitation->isDirty(['type', 'organization_id', 'workspace_id', 'email_normalized', 'token_hash', 'intended_role_id', 'invited_by_user_id', 'expires_at'])) {
                throw new DomainException('Invitation scope, email, token, role intent, inviter, and expiry are immutable once issued.');
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

    public function intendedRole(): BelongsTo
    {
        return $this->belongsTo(ScopedRole::class, 'intended_role_id');
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    /**
     * Deterministic effective state at an instant (UTC). Revocation
     * and acceptance are terminal and take precedence over expiry:
     * a revoked invitation stays revoked even after its expiry
     * passes.
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

    public function isOrganizationScoped(): bool
    {
        return $this->type === self::TYPE_ORGANIZATION;
    }
}
