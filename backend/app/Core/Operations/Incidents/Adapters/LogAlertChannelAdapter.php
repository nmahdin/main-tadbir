<?php

namespace App\Core\Operations\Incidents\Adapters;

use App\Core\Operations\Incidents\AlertChannel;
use App\Core\Operations\Incidents\Contracts\AlertChannelAdapter;
use App\Core\Operations\Incidents\CoreAlert;
use Illuminate\Log\LogManager;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Default alert delivery adapter: writes a structured log entry.
 *
 * Production deployments are expected to bind a richer adapter
 * (e.g. PagerDuty, Bale, webhook) in their service provider;
 * the Log adapter is always registered as a safe default and
 * is used in tests with deterministic assertions.
 */
final class LogAlertChannelAdapter implements AlertChannelAdapter
{
    public function __construct(private readonly LoggerInterface|LogManager $log) {}

    public function channel(): string
    {
        return AlertChannel::LOG->value;
    }

    public function deliver(CoreAlert $alert): bool
    {
        try {
            $this->log->warning('ops.alert', [
                'alert_id' => (int) $alert->id,
                'fingerprint' => $alert->fingerprint,
                'source' => $alert->source,
                'severity' => $alert->severity,
                'incident_id' => $alert->incident_id,
                'occurrences' => (int) $alert->occurrence_count,
                'title' => $alert->title,
            ]);

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
