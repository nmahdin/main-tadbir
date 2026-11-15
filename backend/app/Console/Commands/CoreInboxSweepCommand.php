<?php

namespace App\Console\Commands;

use App\Core\Audit\AuditWriter;
use App\Core\Inbox\ActionInboxService;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Hourly sweep: mark past-due action items as OVERDUE. A future
 * reconciliation pass (origin-module driven via resolveOrigin) is
 * the authoritative completion signal; this only adjusts urgency
 * state for the inbox UX.
 */
final class CoreInboxSweepCommand extends Command
{
    protected $signature = 'core:inbox:sweep';
    protected $description = 'Mark overdue action items and emit audit rows.';

    public function handle(ActionInboxService $service, AuditWriter $audit): int
    {
        $n = $service->sweepOverdue();
        $this->info("Marked {$n} action item(s) overdue.");
        $audit->record(null, 'scheduled.inbox_sweep', ['overdue_count' => $n]);
        return self::SUCCESS;
    }
}
