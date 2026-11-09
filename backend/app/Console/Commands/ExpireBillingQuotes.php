<?php

namespace App\Console\Commands;

use App\Core\Billing\CoreBillingQuote;
use App\Core\Billing\QuoteService;
use Illuminate\Console\Command;

/**
 * C5-M2-S3 quote-expiry sweeper (SPEC §3.7).
 *
 * Chunked, transactional per quote; expired open quotes are moved to
 * `expired` and their promo reservation capacity released. Always
 * safe to run; idempotent per quote. Pair with a production cron
 * running every minute (e.g. every minute for <30m TTL precision).
 *
 *   php artisan billing:expire-quotes           # real expiry
 *   php artisan billing:expire-quotes --dry-run # report counts only
 */
final class ExpireBillingQuotes extends Command
{
    protected $signature = 'billing:expire-quotes {--dry-run : Report how many quotes would expire without mutating}';

    protected $description = 'Expire open billing quotes past their expires_at and release promo reservations.';

    public function handle(QuoteService $quotes): int
    {
        if ($this->option('dry-run')) {
            // Count via a non-locking read (approximate; real count runs
            // inside the sweep).
            $count = CoreBillingQuote::query()
                ->where('status', CoreBillingQuote::STATUS_OPEN)
                ->where('expires_at', '<=', now())
                ->count();
            $this->info("[dry-run] {$count} open quote(s) past expiry; no changes applied.");

            return self::SUCCESS;
        }

        $expired = $quotes->expireOpenQuotes();
        $this->info("Expired {$expired} quote(s) and released their reservations.");

        return self::SUCCESS;
    }
}
