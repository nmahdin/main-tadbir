<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'key',
        'description',
        'project_manager_id',
        'start_date',
        'deadline',
        'status',
        'progress',
        'priority',
        'tags',
        'color',
        'budget',
        'category',
        'template_id',
    ];

    protected $casts = [
        'tags' => 'array',
        'start_date' => 'date',
        'deadline' => 'date',
        'progress' => 'integer',
    ];

    public function projectManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'project_manager_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(ProjectTemplate::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'project_user')
            ->withPivot('joined_at');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }
}
