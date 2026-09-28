<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamActivity extends Model
{
    public $timestamps = false;

    protected $fillable = ['actor_id', 'action', 'metadata'];

    protected $casts = ['metadata' => 'array'];

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(DamAsset::class, 'asset_id');
    }
}
