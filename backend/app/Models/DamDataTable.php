<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DamDataTable extends Model
{
    protected $fillable = ['name', 'description', 'columns', 'grants', 'folder', 'category', 'created_by'];

    protected function casts(): array
    {
        return ['columns' => 'array', 'grants' => 'array'];
    }

    public function departments(): BelongsToMany
    {
        return $this->belongsToMany(Department::class, 'dam_data_table_department');
    }

    public function rows(): HasMany
    {
        return $this->hasMany(DamDataRow::class, 'table_id')->orderBy('position');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(DamDataTableVersion::class, 'table_id');
    }

    public function googleWorkspaceLink(): HasOne
    {
        return $this->hasOne(GoogleWorkspaceLink::class, 'dam_data_table_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
