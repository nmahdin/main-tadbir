<?php

namespace App\Core\Operations\Maintenance;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoreMaintenanceWindow extends Model
{
    protected $table = 'ops_maintenance_windows';

    protected $fillable = [
        'title', 'scope', 'reason', 'status',
        'scheduled_start', 'scheduled_end', 'started_at', 'completed_at', 'cancelled_at',
        'authorized_by_user_id', 'cancelled_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_start' => 'datetime',
            'scheduled_end' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function authorizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by_user_id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }
}
