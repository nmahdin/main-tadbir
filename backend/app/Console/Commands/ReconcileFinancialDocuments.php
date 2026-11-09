<?php

namespace App\Console\Commands;

use App\Core\Billing\Reconciliation\FinancialReconciliationService;
use Illuminate\Console\Command;

/**
 * C5-M6 — Restartable idempotent financial reconciliation.
 *
 * Scans payments/orders/documents and upserts findings for anomalies.
 * Safe to run repeatedly; never auto-corrects ambiguous states.
 */
final class ReconcileFinancialDocuments extends Command
{
    protected $signature = 'billing:reconcile-financials
        {--resolve : Auto-resolve findings that no longer apply. On by default; flag kept for explicit CLI parity.}';

    protected $description = 'Sweep billing state for financial-document and reconciliation anomalies.';

    public function handle(FinancialReconciliationService $recon): int
    {
        $started = microtime(true);
        $result = $recon->sweep();
        $elapsed = (int) round((microtime(true) - $started) * 1000);
        $this->line(sprintf(
            'Financial reconciliation: opened=%d resolved=%d total_open=%d (elapsed_ms=%d).',
            $result['opened'],
            $result['resolved'],
            $result['total_open'],
            $elapsed,
        ));

        if ($result['opened'] > 0 || $result['total_open'] > 0) {
            $this->warn("{$result['total_open']} open finding(s) require inspection ({$result['opened']} newly opened this run).");
        }

        return self::SUCCESS;
    }
}
