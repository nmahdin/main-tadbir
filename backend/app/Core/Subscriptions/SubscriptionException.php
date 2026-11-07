<?php

namespace App\Core\Subscriptions;

use DomainException;

/**
 * A subscription operation was rejected. `errorCode` is stable:
 * subscription_forbidden, reason_required, subscription_not_found,
 * subscription_exists, subscription_owner_invalid,
 * subscription_owner_mismatch, subscription_invalid,
 * subscription_period_invalid, subscription_plan_mismatch
 * (audience), plan_version_not_published,
 * subscription_plan_change_unsupported, subscription_stale_version,
 * subscription_period_immutable, subscription_change_preview_stale,
 * subscription_plan_unchanged, usage_unknown.
 */
final class SubscriptionException extends DomainException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
    ) {
        parent::__construct($message);
    }
}
