<?php

namespace App\Core\Operations\Incidents;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoreAlertDelivery extends Model
{
    protected $table = 'ops_alert_deliveries';

    protected $fillable = ['alert_id', 'channel', 'status', 'attempts', 'last_error'];

    protected function casts(): array
    {
        return [
            'last_attempt_at' => 'datetime',
            'delivered_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function alert(): BelongsTo
    {
        return $this->belongsTo(CoreAlert::class);
    }
}
