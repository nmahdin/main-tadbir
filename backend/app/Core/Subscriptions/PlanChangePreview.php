<?php

namespace App\Core\Subscriptions;

/**
 * Immutable, deterministic plan-change impact preview (C5-4).
 *
 * Module fields compare the explicitly entitled (is_allowed=true)
 * module sets of the current and target published plan versions.
 * $enabledAffected maps workspace id => enabled module keys that
 * LOSE entitlement (they stay enabled and keep all data; runtime
 * access closes immediately after confirmation). $dependencyImpacts
 * maps module key => prerequisite keys losing entitlement.
 * $limits entries: {resource, old, new, usage, status, excess}
 * with status ok|over_limit|unknown. $blockingReasons carry stable
 * codes; `usage_unknown` blocks because an unmeasurable dimension
 * must never be represented as validated. Over-limit is a warning:
 * existing records are preserved and further growth enforcement
 * belongs to later stages — the change is confirmable only with
 * that excess explicitly previewed.
 */
final readonly class PlanChangePreview
{
    /**
     * @param  array{key: string, version: int, grace_days: int}  $currentPlan
     * @param  array{key: string, version: int, grace_days: int}  $targetPlan
     * @param  list<string>  $retainedModules
     * @param  list<string>  $losingModules
     * @param  list<string>  $gainingModules
     * @param  array<int, list<string>>  $enabledAffected
     * @param  array<string, list<string>>  $dependencyImpacts
     * @param  list<array{resource: string, old: ?array, new: ?array, usage: ?int, status: string, excess: ?int}>  $limits
     * @param  list<array{code: string, message: string}>  $warnings
     * @param  list<array{code: string, message: string}>  $blockingReasons
     */
    public function __construct(
        public int $subscriptionId,
        public string $ownerKey,
        public string $ownerType,
        public array $currentPlan,
        public array $targetPlan,
        public string $effectiveAt,
        public array $retainedModules,
        public array $losingModules,
        public array $gainingModules,
        public array $enabledAffected,
        public array $dependencyImpacts,
        public array $limits,
        public array $warnings,
        public array $blockingReasons,
        public string $confirmationToken,
    ) {}

    public function confirmable(): bool
    {
        return $this->blockingReasons === [];
    }
}
