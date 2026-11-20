<?php

namespace App\Core\Operations\Incidents;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CoreIncident extends Model
{
    protected $table = 'ops_incidents';

    protected $fillable = [
        'reference', 'title', 'severity', 'status', 'source',
        'summary', 'resolution_notes',
        'opened_by_user_id', 'assigned_to_user_id', 'resolved_by_user_id',
        'opened_at', 'acknowledged_at', 'mitigated_at', 'resolved_at', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'mitigated_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by_user_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_user_id');
    }

    public function activity(): HasMany
    {
        return $this->hasMany(CoreIncidentActivity::class, 'incident_id');
    }

    public function alerts(): HasMany
    {
        return $this->hasMany(CoreAlert::class, 'incident_id');
    }
}
