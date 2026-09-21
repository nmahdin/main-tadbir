<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'project_id',
        'content_id',
        'content_stage_id',
        'kind',
        'assignee_id',
        'priority',
        'status',
        'start_date',
        'deadline',
        'estimated_hours',
        'logged_hours',
        'tags',
        'dependencies',
        'is_blocked',
        'blocked_reason',
    ];

    protected $casts = [
        'tags' => 'array',
        'dependencies' => 'array',
        'is_blocked' => 'boolean',
        'start_date' => 'date',
        'deadline' => 'date',
        'estimated_hours' => 'integer',
        'logged_hours' => 'integer',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function content(): BelongsTo
    {
        return $this->belongsTo(Content::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TaskAttachment::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }
}

