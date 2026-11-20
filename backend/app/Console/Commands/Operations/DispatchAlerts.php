<?php

namespace App\Console\Commands\Operations;

use App\Core\Operations\Incidents\Adapters\LogAlertChannelAdapter;
use App\Core\Operations\Incidents\AlertDispatcher;
use App\Core\Security\Events\SecurityEventWriter;
use Illuminate\Console\Command;

final class DispatchAlerts extends Command
{
    protected $signature = 'ops:alerts:dispatch {--limit=50}';

    protected $description = 'Dispatch pending alerts through registered channel adapters (C7-E).';

    public function handle(SecurityEventWriter $events): int
    {
        $dispatcher = new AlertDispatcher($events);
        $dispatcher->register(new LogAlertChannelAdapter($this->getLaravel()->make('log')));
        $processed = $dispatcher->dispatchPending((int) $this->option('limit'));
        $this->line("Dispatched {$processed} pending alert(s).");

        return self::SUCCESS;
    }
}
