<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DamFolder extends Model
{
    public const SYSTEM = 'system';
    public const USER = 'user';

    protected $fillable = [
        'name', 'parent_id', 'department_id', 'management_type', 'system_key', 'created_by',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function isSystemManaged(): bool
    {
        return $this->management_type === self::SYSTEM;
    }
}
