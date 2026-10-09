<?php

namespace App\Models;

use App\Models\Concerns\TracksArchiveStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    use HasFactory;
    use TracksArchiveStatus;

    protected $fillable = [
        'title',
        'description',
        'project_id',
        'content_id',
        'content_stage_id',
        'kind',
        'parent_task_id',
        'source_key',
        'source_event_id',
        'assignee_id',
        'priority',
        'status',
        'start_date',
        'deadline',
        'estimated_hours',
        'logged_hours',
        'tags',
        'dependencies',
        'subtasks',
        'context',
        'is_blocked',
        'blocked_reason',
    ];

    protected static function booted(): void
    {
        static::deleting(fn (self $task) => $task->comments()->delete());
    }

    protected $casts = [
        'tags' => 'array',
        'dependencies' => 'array',
        'subtasks' => 'array',
        'context' => 'array',
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
        return $this->hasMany(Comment::class, 'subject_id')->where('subject_type', 'task')->oldest();
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
