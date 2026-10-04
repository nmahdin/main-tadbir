<?php

namespace App\Models;

use App\Models\Concerns\TracksArchiveStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Content extends Model
{
    use HasFactory;
    use TracksArchiveStatus;

    protected $fillable = [
        'title',
        'code',
        'type',
        'status',
        'deadline',
        'owner_id',
        'project_id',
        'series_id',
        'series_sequence',
        'period_key',
        'payload',
    ];

    protected static function booted(): void
    {
        static::deleting(fn (self $content) => $content->comments()->delete());
    }

    protected $casts = [
        'deadline' => 'date',
        'payload' => 'array',
        'series_sequence' => 'integer',
    ];

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'subject_id')->where('subject_type', 'content')->oldest();
    }

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function series(): BelongsTo { return $this->belongsTo(ContentSeries::class, 'series_id'); }
    public function tasks(): HasMany { return $this->hasMany(Task::class); }
    public function watchers(): BelongsToMany { return $this->belongsToMany(User::class, 'content_watchers')->withTimestamps(); }
}
