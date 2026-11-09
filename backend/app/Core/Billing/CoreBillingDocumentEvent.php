<?php

namespace App\Core\Billing;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only event log for financial documents.
 */
class CoreBillingDocumentEvent extends Model
{
    public const CREATED_AT = 'occurred_at';

    public const UPDATED_AT = null;

    public $timestamps = false;

    protected $table = 'core_billing_document_events';

    protected $fillable = [
        'document_id', 'event', 'from_status', 'to_status',
        'data', 'actor_user_id', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'document_id' => 'integer',
            'data' => 'json',
            'actor_user_id' => 'integer',
            'occurred_at' => 'datetime',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(CoreBillingDocument::class, 'document_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
