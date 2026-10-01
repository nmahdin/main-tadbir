<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkspaceRecord extends Model
{
    public const KIND_IDEA = 'idea';

    public const KIND_MEETING = 'think_tank_meeting';

    public const KIND_LETTER = 'secretariat_letter';

    public const KIND_RESOLUTION = 'secretariat_resolution';

    public const KIND_DOSSIER = 'archive_dossier';

    protected $fillable = [
        'kind',
        'title',
        'status',
        'owner_id',
        'client_request_id',
        'payload',
    ];

    protected static function booted(): void
    {
        static::deleting(function (self $record): void {
            if ($record->kind === self::KIND_IDEA) {
                $record->comments()->delete();
            }
        });
    }

    protected $casts = [
        'payload' => 'array',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'subject_id')->where('subject_type', 'idea')->oldest();
    }
}
