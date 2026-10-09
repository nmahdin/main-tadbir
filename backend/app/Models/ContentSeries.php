<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class ContentSeries extends Model
{
    use HasFactory;

    protected $table = 'content_series';

    protected $fillable = [
        'name', 'description', 'code_prefix', 'content_type', 'project_id', 'department_id',
        'owner_id', 'process_template_id', 'status', 'recurrence_type', 'recurrence_config',
        'default_content_payload', 'default_publication_config', 'next_sequence_number',
        'lock_version', 'current_revision_id', 'created_by', 'archived_at',
    ];

    protected $casts = [
        'recurrence_config' => 'array', 'default_content_payload' => 'array',
        'default_publication_config' => 'array', 'next_sequence_number' => 'integer',
        'lock_version' => 'integer', 'current_revision_id' => 'integer', 'archived_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function contents(): HasMany
    {
        return $this->hasMany(Content::class, 'series_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(ContentSeriesRevision::class, 'series_id');
    }

    public function tasks(): HasManyThrough
    {
        return $this->hasManyThrough(Task::class, Content::class, 'series_id', 'content_id');
    }

    public function currentRevision(): BelongsTo
    {
        return $this->belongsTo(ContentSeriesRevision::class, 'current_revision_id');
    }

    public function plans(): HasMany
    {
        return $this->hasMany(ProjectContentPlan::class, 'default_series_id');
    }
}
