<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DamDataTableVersion extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'table_id', 'version_number', 'source', 'snapshot',
        'change_description', 'created_by', 'created_at',
    ];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'created_at' => 'datetime'];
    }

    public function dataTable(): BelongsTo
    {
        return $this->belongsTo(DamDataTable::class, 'table_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
