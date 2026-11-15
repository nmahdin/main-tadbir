<?php

namespace App\Core\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $reference
 * @property string $subject
 * @property string $category
 * @property string $status
 * @property string $priority
 * @property int $owner_user_id
 * @property int|null $assigned_user_id
 * @property int|null $organization_id
 * @property \Illuminate\Support\Carbon|null $resolved_at
 * @property \Illuminate\Support\Carbon|null $closed_at
 * @property \Illuminate\Support\Carbon|null $last_replied_at
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class CoreSupportTicket extends Model
{
    protected $table = 'core_support_tickets';

    protected $fillable = [
        'reference', 'subject', 'category', 'status', 'priority',
        'owner_user_id', 'assigned_user_id', 'organization_id',
        'resolved_at', 'closed_at', 'last_replied_at',
    ];

    protected function casts(): array
    {
        return [
            'owner_user_id' => 'integer',
            'assigned_user_id' => 'integer',
            'organization_id' => 'integer',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'last_replied_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo { return $this->belongsTo(User::class, 'owner_user_id'); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_user_id'); }

    public function messages(): HasMany { return $this->hasMany(CoreSupportMessage::class, 'ticket_id'); }
    public function activity(): HasMany { return $this->hasMany(CoreSupportActivity::class, 'ticket_id'); }
    public function attachments(): HasMany { return $this->hasMany(CoreSupportAttachment::class, 'ticket_id'); }

    public function scopeVisibleTo(Builder $q, User $user, bool $isSupportAgent): Builder
    {
        if ($isSupportAgent) {
            return $q;
        }
        return $q->where('owner_user_id', $user->id);
    }

    public function scopeOpen(Builder $q): Builder
    {
        return $q->whereNotIn('status', [SupportTicketStatus::CLOSED->value, SupportTicketStatus::RESOLVED->value]);
    }

    public function scopeQueue(Builder $q): Builder
    {
        return $q->where('status', SupportTicketStatus::NEW->value)
            ->orWhere('status', SupportTicketStatus::OPEN->value)
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
            ->orderBy('created_at');
    }

    public function isOwner(User $u): bool
    {
        return $this->owner_user_id === $u->id;
    }

    public function canTransitionTo(SupportTicketStatus $target): bool
    {
        $current = SupportTicketStatus::from($this->status);
        return $current->canTransitionTo($target);
    }
}
