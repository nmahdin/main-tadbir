<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DamDataTable extends Model
{
    protected $fillable = ['name', 'description', 'columns', 'grants', 'created_by'];

    protected function casts(): array
    {
        return ['columns' => 'array', 'grants' => 'array'];
    }

    public function rows(): HasMany
    {
        return $this->hasMany(DamDataRow::class, 'table_id')->orderBy('position');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
