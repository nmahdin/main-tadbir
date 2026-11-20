<?php

namespace App\Core\Operations\Maintenance;

use App\Core\Security\Events\SecurityEventOutcome;
use App\Core\Security\Events\SecurityEventWriter;
use App\Models\User;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Controlled maintenance window governance (C7-F). Windows are
 * scheduled in advance; activation requires an explicit authorized
 * step; overlaps are prevented; start/complete/cancel events are
 * audited.
 */
final class MaintenanceService
{
    public function __construct(private readonly SecurityEventWriter $events) {}

    /**
     * Schedule a new maintenance window.
     */
    public function schedule(User $actor, array $payload): CoreMaintenanceWindow
    {
        $start = CarbonImmutable::parse($payload['scheduled_start']);
        $end = CarbonImmutable::parse($payload['scheduled_end']);
        if (! $end->isAfter($start)) {
            throw new DomainException('Maintenance end must be after start.');
        }

        return DB::transaction(function () use ($actor, $payload, $start, $end): CoreMaintenanceWindow {
            // Reject overlapping windows (status != cancelled/completed).
            $overlap = DB::table('ops_maintenance_windows')
                ->whereIn('status', ['scheduled', 'active'])
                ->where(function ($q) use ($start, $end): void {
                    $q->whereBetween('scheduled_start', [$start, $end])
                        ->orWhereBetween('scheduled_end', [$start, $end])
                        ->orWhere(function ($q2) use ($start, $end): void {
                            $q2->where('scheduled_start', '<', $start)->where('scheduled_end', '>', $end);
                        });
                })->exists();
            if ($overlap) {
                throw new DomainException('A maintenance window already overlaps the requested period.');
            }
            $window = CoreMaintenanceWindow::create([
                'title' => $payload['title'],
                'scope' => $payload['scope'] ?? 'platform',
                'reason' => $payload['reason'] ?? null,
                'status' => MaintenanceStatus::SCHEDULED->value,
                'scheduled_start' => $start,
                'scheduled_end' => $end,
                'authorized_by_user_id' => $actor->id,
            ]);
            $this->events->record('ops.maintenance.scheduled', SecurityEventOutcome::SUCCESS,
                $actor, targetType: 'ops_maintenance_window', targetId: $window->id,
                metadata: ['scope' => $window->scope]);

            return $window;
        });
    }

    public function activate(User $actor, CoreMaintenanceWindow $window): CoreMaintenanceWindow
    {
        return DB::transaction(function () use ($actor, $window): CoreMaintenanceWindow {
            if ($window->status !== MaintenanceStatus::SCHEDULED->value) {
                throw new DomainException('Only scheduled windows can be activated.');
            }
            $window->status = MaintenanceStatus::ACTIVE->value;
            $window->started_at = now();
            $window->save();
            $this->events->record('ops.maintenance.activated', SecurityEventOutcome::SUCCESS,
                $actor, targetType: 'ops_maintenance_window', targetId: $window->id);

            return $window;
        });
    }

    public function complete(User $actor, CoreMaintenanceWindow $window): CoreMaintenanceWindow
    {
        return DB::transaction(function () use ($actor, $window): CoreMaintenanceWindow {
            if ($window->status !== MaintenanceStatus::ACTIVE->value) {
                throw new DomainException('Only active windows can be completed.');
            }
            $window->status = MaintenanceStatus::COMPLETED->value;
            $window->completed_at = now();
            $window->save();
            $this->events->record('ops.maintenance.completed', SecurityEventOutcome::SUCCESS,
                $actor, targetType: 'ops_maintenance_window', targetId: $window->id);

            return $window;
        });
    }

    public function cancel(User $actor, CoreMaintenanceWindow $window): CoreMaintenanceWindow
    {
        return DB::transaction(function () use ($actor, $window): CoreMaintenanceWindow {
            if ($window->status === MaintenanceStatus::COMPLETED->value || $window->status === MaintenanceStatus::CANCELLED->value) {
                throw new DomainException('Window is already completed or cancelled.');
            }
            $window->status = MaintenanceStatus::CANCELLED->value;
            $window->cancelled_at = now();
            $window->cancelled_by_user_id = $actor->id;
            $window->save();
            $this->events->record('ops.maintenance.cancelled', SecurityEventOutcome::SUCCESS,
                $actor, targetType: 'ops_maintenance_window', targetId: $window->id);

            return $window;
        });
    }

    public function current(): ?CoreMaintenanceWindow
    {
        return CoreMaintenanceWindow::query()
            ->where('status', MaintenanceStatus::ACTIVE->value)
            ->first();
    }

    public function nextScheduled(): ?CoreMaintenanceWindow
    {
        return CoreMaintenanceWindow::query()
            ->where('status', MaintenanceStatus::SCHEDULED->value)
            ->where('scheduled_start', '>', now())
            ->orderBy('scheduled_start')
            ->first();
    }
}
