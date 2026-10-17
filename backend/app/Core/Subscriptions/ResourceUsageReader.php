<?php

namespace App\Core\Subscriptions;

/**
 * Measures CURRENT usage for plan resource dimensions (C5-4).
 *
 * Returns a map of resource key => measured usage, where a null
 * value means the dimension cannot be measured reliably for this
 * owner right now (unsupported or not applicable). Null is never
 * silently treated as zero by consumers: plan-change previews
 * surface it as `unknown` and fail closed when a target plan would
 * cap an unmeasurable dimension.
 */
interface ResourceUsageReader
{
    /** @return array<string, int|null> */
    public function measure(SubscriptionOwner $owner): array;
}
