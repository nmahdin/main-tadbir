<?php

namespace App\Console\Commands;

use App\Core\Billing\CoreBillingOrder;
use App\Core\Billing\OrderService;
use Illuminate\Console\Command;

/**
 * C5-M2-S4 order-review expiry sweeper (SPEC §3.4, §3.7).
 *
 * Chunked, transactional per order. Expires in_review orders past
 * review_expires_at and releases their promo reservations (capacity
 * becomes available again). Always safe to run; idempotent per order.
 * Pair with a production cron running every hour (the default
 * review window is seven days; hourly is ample precision).
 *
 *   php artisan billing:expire-orders           # real expiry
 *   php artisan billing:expire-orders --dry-run # report counts only
 */
final class ExpireBillingOrders extends Command
{
    protected $signature = 'billing:expire-orders {--dry-run : Report how many orders would expire without mutating}';

    protected $description = 'Expire in-review billing orders past review_expires_at and release promo reservations.';

    public function handle(OrderService $orders): int
    {
        if ($this->option('dry-run')) {
            $count = CoreBillingOrder::query()
                ->where('status', CoreBillingOrder::STATUS_IN_REVIEW)
                ->where('review_expires_at', '<=', now())
                ->count();
            $this->info("[dry-run] {$count} in-review order(s) past review expiry; no changes applied.");

            return self::SUCCESS;
        }

        $expired = $orders->expireReviewOrders();
        $this->info("Expired {$expired} in-review order(s) and released their reservations.");

        return self::SUCCESS;
    }
}
