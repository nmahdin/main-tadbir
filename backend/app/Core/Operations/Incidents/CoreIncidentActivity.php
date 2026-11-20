<?php

namespace App\Core\Operations\Incidents;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoreIncidentActivity extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'ops_incident_activity';

    protected $fillable = ['incident_id', 'actor_user_id', 'event_type', 'payload'];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(CoreIncident::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
