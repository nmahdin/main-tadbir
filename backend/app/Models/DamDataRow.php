<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DamDataRow extends Model
{
    protected $fillable = ['table_id', 'cells', 'position', 'created_by', 'updated_by', 'task_id'];

    protected function casts(): array
    {
        return ['cells' => 'array'];
    }

    public function dataTable(): BelongsTo
    {
        return $this->belongsTo(DamDataTable::class, 'table_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'task_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(DamDataRowActivity::class, 'row_id')->orderByDesc('created_at')->orderByDesc('id');
    }
}
