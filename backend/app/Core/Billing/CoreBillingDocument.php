<?php

namespace App\Core\Billing;

use App\Core\Billing\Documents\BillingDocumentStatus;
use App\Core\Billing\Documents\BillingDocumentType;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * C5-M5 immutable financial document (invoice/receipt).
 *
 * Monetary columns are SIGNED BIGINT Toman (whole-integer, never
 * floats). Once status transitions to ISSUED the snapshot fields
 * MUST NOT be mutated; voiding is performed via an append-only
 * event record and flips status to VOID with an audit trail.
 */
class CoreBillingDocument extends Model
{
    protected $table = 'core_billing_documents';

    protected $fillable = [
        'owner_key', 'number', 'doc_number', 'doc_type', 'status',
        'order_id', 'payment_id', 'related_invoice_id', 'period',
        'seller_name', 'seller_tax_id', 'buyer_name', 'buyer_contact',
        'plan_version_id', 'plan_name_snapshot', 'currency_code',
        'subtotal_toman', 'discount_toman', 'tax_toman', 'total_toman',
        'tax_rate_snapshot', 'promo_code_snapshot',
        'provider_name', 'provider_transaction_id',
        'items_json', 'notes',
        'idempotency_key', 'issued_at',
        'void_reason', 'voided_by_user_id', 'voided_at',
        'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'number' => 'integer',
            'order_id' => 'integer',
            'payment_id' => 'integer',
            'related_invoice_id' => 'integer',
            'plan_version_id' => 'integer',
            'subtotal_toman' => 'integer',
            'discount_toman' => 'integer',
            'tax_toman' => 'integer',
            'total_toman' => 'integer',
            'items_json' => 'json',
            'issued_at' => 'datetime',
            'voided_at' => 'datetime',
            'voided_by_user_id' => 'integer',
            'created_by_user_id' => 'integer',
        ];
    }

    // ---- Scopes ----

    public function scopeForOwner(Builder $q, string $ownerKey): Builder
    {
        return $q->where('owner_key', $ownerKey);
    }

    public function scopeType(Builder $q, BillingDocumentType $type): Builder
    {
        return $q->where('doc_type', $type->value);
    }

    public function scopeIssued(Builder $q): Builder
    {
        return $q->where('status', BillingDocumentStatus::ISSUED->value);
    }

    // ---- Relations ----

    public function order(): BelongsTo
    {
        return $this->belongsTo(CoreBillingOrder::class, 'order_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(CoreBillingPayment::class, 'payment_id');
    }

    public function relatedInvoice(): BelongsTo
    {
        return $this->belongsTo(self::class, 'related_invoice_id');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(self::class, 'related_invoice_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(CoreBillingDocumentEvent::class, 'document_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function voidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by_user_id');
    }

    public function isInvoice(): bool
    {
        return $this->doc_type === BillingDocumentType::INVOICE->value;
    }

    public function isReceipt(): bool
    {
        return $this->doc_type === BillingDocumentType::RECEIPT->value;
    }

    public function isImmutable(): bool
    {
        return in_array($this->status, [BillingDocumentStatus::ISSUED->value, BillingDocumentStatus::VOID->value], true);
    }
}
