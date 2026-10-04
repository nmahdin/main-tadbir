<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeriesBatchRequest extends Model
{
    protected $fillable = ['series_id', 'request_key', 'content_ids'];
    protected $casts = ['content_ids' => 'array'];
    public function series(): BelongsTo { return $this->belongsTo(ContentSeries::class, 'series_id'); }
}
