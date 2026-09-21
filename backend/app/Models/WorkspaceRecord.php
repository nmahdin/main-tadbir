<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }
}
