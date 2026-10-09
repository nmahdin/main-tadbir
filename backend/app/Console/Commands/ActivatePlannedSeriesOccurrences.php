<?php

namespace App\Console\Commands;

use App\Services\PlannedOccurrenceActivator;
use Illuminate\Console\Command;

class ActivatePlannedSeriesOccurrences extends Command
{
    protected $signature = 'series:activate-due {--limit=100}';
    protected $description = 'Idempotently materialize tasks for due planned Series occurrences';

    public function handle(PlannedOccurrenceActivator $activator): int
    {
        $count = $activator->activateDue(now(), (int) $this->option('limit'));
        $this->info("Activated {$count} planned occurrence(s).");
        return self::SUCCESS;
    }
}
