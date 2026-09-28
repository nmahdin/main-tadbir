<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamDataRowActivity extends Model
{
    public $timestamps = false;

    protected $fillable = ['table_id', 'row_id', 'actor_id', 'action', 'metadata'];

    protected $casts = ['metadata' => 'array'];

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function row(): BelongsTo
    {
        return $this->belongsTo(DamDataRow::class, 'row_id');
    }
}
