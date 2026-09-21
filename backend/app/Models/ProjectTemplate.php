<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProjectTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'category',
        'icon',
        'color',
        'default_priority',
        'estimated_duration_days',
        'budget',
        'stages',
        'tasks',
        'tags',
        'is_built_in',
    ];

    protected $casts = [
        'stages' => 'array',
        'tasks' => 'array',
        'tags' => 'array',
        'is_built_in' => 'boolean',
        'estimated_duration_days' => 'integer',
    ];

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class, 'template_id');
    }
}

