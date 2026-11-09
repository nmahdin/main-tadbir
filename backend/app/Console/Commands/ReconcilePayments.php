<?php

namespace App\Console\Commands;

use App\Core\Billing\PaymentService;
use App\Core\Billing\CoreBillingFulfillmentOutbox;
use App\Core\Subscriptions\SubscriptionFulfillment;
use Illuminate\Console\Command;

final class ReconcilePayments extends Command
{
    protected $signature = 'billing:reconcile-payments';

    protected $description = 'Re-verify pending payments and dispatch the fulfillment outbox.';

    public function handle(PaymentService $payments, SubscriptionFulfillment $fulfillment): int
    {
        $retried = $payments->reconcilePending();
        $dispatched = $payments->dispatchOutbox(function (CoreBillingFulfillmentOutbox $evt) use ($fulfillment): void {
            $fulfillment->fulfillPaid($evt);
        });
        $this->info("Re-verified {$retried} pending payment(s); dispatched {$dispatched} fulfillment event(s).");

        return self::SUCCESS;
    }
}
