<?php

namespace App\Core\Inbox;

use App\Core\Audit\AuditWriter;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One per-recipient actionable work entry (CORE-REQ). The origin module
 * remains authoritative for its own business state; this record carries
 * only the cached, safe-to-display data needed to render the inbox
 * without N+1 origin lookups.
 *
 * Deterministic identity: (origin_module, origin_type, origin_id,
 * recipient_user_id, organization_id) is unique, so providers can
 * upsert idempotently.
 */
class CoreActionItem extends Model
{
    protected $table = 'core_action_items';

    protected $fillable = [
        'origin_module', 'origin_type', 'origin_id', 'action_kind',
        'title', 'summary', 'deep_link', 'urgency', 'due_at',
        'recipient_user_id', 'organization_id', 'assigned_user_id',
        'allowed_actions', 'origin_context', 'resolved_at', 'resolved_by_module',
        'resolved_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'allowed_actions' => 'array',
            'origin_context' => 'array',
            'due_at' => 'datetime',
            'resolved_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    // ---- Scopes ----

    public function scopeForUser(Builder $q, User $user): Builder
    {
        $orgIds = OrganizationMembership::query()
            ->where('user_id', $user->id)
            ->where('status', MembershipStatus::Active->value)
            ->pluck('organization_id');

        return $q->where(function (Builder $inner) use ($user, $orgIds): void {
            $inner->where('recipient_user_id', $user->id)
                ->orWhere(function (Builder $orgs) use ($orgIds): void {
                    $orgs->whereNotNull('organization_id')
                        ->whereNull('recipient_user_id')
                        ->whereIn('organization_id', $orgIds);
                });
        });
    }

    public function scopeOpen(Builder $q): Builder
    {
        return $q->whereNull('resolved_at')->whereIn('action_kind', [
            ActionItemStatus::OPEN->value,
            ActionItemStatus::BLOCKED->value,
            ActionItemStatus::OVERDUE->value,
        ]);
    }

    public function scopeOfKind(Builder $q, ActionItemStatus $kind): Builder
    {
        return $q->where('action_kind', $kind->value);
    }

    public function scopeOverdue(Builder $q, ?CarbonImmutable $now = null): Builder
    {
        $now ??= CarbonImmutable::now('UTC');

        return $q->whereNull('resolved_at')
            ->whereNotNull('due_at')
            ->where('due_at', '<', $now);
    }

    // ---- Relations ----

    public function recipientUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'organization_id');
    }

    // ---- Lifecycle ----

    public function resolve(
        string $byModule,
        ?User $actor = null,
        ?CarbonImmutable $at = null,
        ?AuditWriter $audit = null,
    ): void {
        if ($this->resolved_at !== null) {
            return; // idempotent
        }
        $this->resolved_at = $at ?? CarbonImmutable::now('UTC');
        $this->resolved_by_module = $byModule;
        $this->resolved_by_user_id = $actor?->id;
        $this->action_kind = ActionItemStatus::RESOLVED->value;
        $this->save();

        if ($audit !== null) {
            $audit->record(
                $actor,
                'action_item.resolved',
                ['item_id' => (int) $this->id, 'origin' => $this->originModuleKey(), 'by_module' => $byModule],
            );
        }
    }

    public function markOverdueIfDue(?CarbonImmutable $now = null): bool
    {
        $now ??= CarbonImmutable::now('UTC');
        if ($this->resolved_at !== null) {
            return false;
        }
        if ($this->due_at === null || $this->due_at->gte($now)) {
            return false;
        }
        if ($this->action_kind === ActionItemStatus::OVERDUE->value) {
            return false;
        }
        $this->action_kind = ActionItemStatus::OVERDUE->value;
        $this->save();

        return true;
    }

    public function isOverdue(?CarbonImmutable $now = null): bool
    {
        $now ??= CarbonImmutable::now('UTC');

        return $this->resolved_at === null
            && $this->due_at !== null
            && $this->due_at->lt($now);
    }

    public function originModuleKey(): string
    {
        return $this->origin_module.':'.$this->origin_type.':'.(int) $this->origin_id;
    }

    /**
     * Generate a deep-link token-signed URL helper (just the path string
     * is stored; actual route generation is done by the origin module).
     */
    public static function safeDeepLink(string $path): ?string
    {
        $path = trim($path);
        if ($path === '' || strlen($path) > 500) {
            return null;
        }
        if (preg_match('#^[a-zA-Z][a-zA-Z0-9+.\-]*:#', $path)
            && ! str_starts_with($path, '/')) {
            return null;
        }

        return $path;
    }
}
