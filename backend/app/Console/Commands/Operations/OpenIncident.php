<?php

namespace App\Console\Commands\Operations;

use App\Core\Operations\Incidents\IncidentService;
use App\Core\Operations\Incidents\IncidentSeverity;
use Illuminate\Console\Command;
use RuntimeException;

final class OpenIncident extends Command
{
    protected $signature = 'ops:incidents:open
        {title : Incident title (required)}
        {--severity=medium : critical|high|medium|low|info}
        {--source=manual : Source identifier}
        {--summary= : Optional summary/details}';

    protected $description = 'Manually open an incident (C7-E).';

    public function handle(IncidentService $incidents): int
    {
        $severity = IncidentSeverity::tryFrom((string) $this->option('severity'));
        if (! $severity) {
            $this->error('Invalid --severity; must be one of critical|high|medium|low|info.');

            return self::FAILURE;
        }
        try {
            $incident = $incidents->openManually(
                null,
                $severity,
                (string) $this->argument('title'),
                (string) ($this->option('summary') ?? ''),
                (string) $this->option('source'),
            );
            $this->line("Opened incident {$incident->reference} [{$incident->status}].");
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
