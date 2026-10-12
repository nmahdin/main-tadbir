<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Immutable configuration snapshot used by future independent occurrences. */
class ContentSeriesRevision extends Model
{
    use HasFactory;

    protected $fillable = [
        'series_id', 'version', 'effective_from_sequence', 'content_type',
        'process_template_id', 'recurrence_type', 'recurrence_config',
        'default_content_payload', 'default_publication_config',
        'change_reason', 'changed_by',
    ];

    protected $casts = [
        'version' => 'integer',
        'effective_from_sequence' => 'integer',
        'recurrence_config' => 'array',
        'default_content_payload' => 'array',
        'default_publication_config' => 'array',
    ];

    public function series(): BelongsTo
    {
        return $this->belongsTo(ContentSeries::class, 'series_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }

    public function contents(): HasMany
    {
        return $this->hasMany(Content::class, 'series_revision_id');
    }
}
