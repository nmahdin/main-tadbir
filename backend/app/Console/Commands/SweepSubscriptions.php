<?php

namespace App\Console\Commands;

use App\Core\Subscriptions\SubscriptionFulfillment;
use Illuminate\Console\Command;

final class SweepSubscriptions extends Command
{
    protected $signature = 'billing:sweep-subscriptions {--dry-run : Report counts only}';

    protected $description = 'Apply due pending plan changes and transition expired-grace subscriptions to Free.';

    public function handle(SubscriptionFulfillment $fulfillment): int
    {
        if ($this->option('dry-run')) {
            $this->info('[dry-run] would apply pending downgrades / grace-expiry transitions.');

            return self::SUCCESS;
        }
        $result = $fulfillment->sweep();
        $this->info('Applied '.$result['pending_changes_applied'].' pending change(s); transitioned '.$result['expired_to_free'].' subscription(s) to Free after grace.');

        return self::SUCCESS;
    }
}
