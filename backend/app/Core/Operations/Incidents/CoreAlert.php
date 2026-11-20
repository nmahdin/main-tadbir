<?php

namespace App\Core\Operations\Incidents;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CoreAlert extends Model
{
    protected $table = 'ops_alerts';

    protected $fillable = [
        'fingerprint', 'source', 'severity', 'status', 'title', 'body', 'payload',
        'incident_id', 'occurrence_count',
        'first_observed_at', 'last_observed_at', 'acknowledged_at', 'resolved_at',
        'acknowledged_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'first_observed_at' => 'datetime',
            'last_observed_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'resolved_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(CoreIncident::class);
    }

    public function acknowledgedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by_user_id');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(CoreAlertDelivery::class, 'alert_id');
    }
}
