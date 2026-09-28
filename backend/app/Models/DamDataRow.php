<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamDataRow extends Model
{
    protected $fillable = ['table_id', 'cells', 'position'];

    protected function casts(): array
    {
        return ['cells' => 'array'];
    }

    public function dataTable(): BelongsTo
    {
        return $this->belongsTo(DamDataTable::class, 'table_id');
    }
}
