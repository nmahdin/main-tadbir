<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectContentPlan extends Model
{
    use HasFactory;

    protected $fillable = ['project_id', 'content_type', 'planned_count', 'notes', 'default_series_id', 'deadline', 'created_by'];

    protected $casts = ['planned_count' => 'integer', 'deadline' => 'date'];

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function defaultSeries(): BelongsTo { return $this->belongsTo(ContentSeries::class, 'default_series_id'); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
