<?php

namespace App\Models;

use App\Models\Concerns\TracksArchiveStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Content extends Model
{
    use HasFactory;
    use TracksArchiveStatus;

    protected $fillable = [
        'title',
        'type',
        'status',
        'deadline',
        'owner_id',
        'project_id',
        'payload',
    ];

    protected static function booted(): void
    {
        static::deleting(fn (self $content) => $content->comments()->delete());
    }

    protected $casts = [
        'deadline' => 'date',
        'payload' => 'array',
    ];

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'subject_id')->where('subject_type', 'content')->oldest();
    }
}
