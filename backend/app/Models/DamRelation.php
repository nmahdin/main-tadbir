<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamRelation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'asset_id', 'related_type', 'related_id', 'relation_type',
        'stage_id', 'output_id', 'asset_version_id', 'context_key', 'metadata',
        'created_by',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(DamAsset::class, 'asset_id');
    }

    public function assetVersion(): BelongsTo
    {
        return $this->belongsTo(DamVersion::class, 'asset_version_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
