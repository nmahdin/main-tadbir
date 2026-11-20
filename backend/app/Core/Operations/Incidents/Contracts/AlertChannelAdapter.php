<?php

namespace App\Core\Operations\Incidents\Contracts;

use App\Core\Operations\Incidents\CoreAlert;

interface AlertChannelAdapter
{
    /**
     * Deliver the alert via this channel. Return true on success, false
     * on a retryable failure (the caller will retry per backoff policy).
     */
    public function deliver(CoreAlert $alert): bool;

    /**
     * Stable channel identifier (must match an AlertChannel case value).
     */
    public function channel(): string;
}
