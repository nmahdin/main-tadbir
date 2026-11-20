<?php

namespace App\Console\Commands\Operations;

use App\Core\Operations\Health\HealthService;
use App\Core\Operations\Incidents\IncidentSeverity;
use App\Core\Operations\Incidents\IncidentService;
use Illuminate\Console\Command;
use Throwable;

/**
 * Scheduled health sweep (C7-D/E). If any component is degraded, raises
 * (or re-uses) an alert fingerprinted by source. Runs every minute
 * but deduplicates via IncidentService.
 */
final class HealthSweep extends Command
{
    protected $signature = 'ops:health-sweep';

    protected $description = 'Check component health and raise alerts on degradation.';

    public function handle(HealthService $health, IncidentService $incidents): int
    {
        try {
            $details = $health->details();
            $degraded = [];
            foreach (($details['checks'] ?? []) as $component => $result) {
                if (($result['status'] ?? 'ok') !== 'ok') {
                    $degraded[] = $component;
                }
            }
            if (($details['queue']['failed_jobs'] ?? 0) > 100) {
                $degraded[] = 'failed_jobs_high';
            }
            foreach ($degraded as $component) {
                $incidents->raiseAlert(
                    'health',
                    'health:'.$component,
                    IncidentSeverity::HIGH,
                    "Health degraded: {$component}",
                    null,
                    ['component' => $component],
                );
            }
            if (! $degraded && isset($details['backups']) && $details['backups']['status'] === 'degraded') {
                $incidents->raiseAlert(
                    'health', 'health:backups_stale', IncidentSeverity::MEDIUM,
                    'Backup freshness exceeds threshold',
                );
            }
        } catch (Throwable $e) {
            $this->error('Health sweep failed: '.$e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
