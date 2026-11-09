<?php

namespace App\Core\Modules;

/**
 * Immutable, deterministic activation preview (Stage C4-2).
 *
 *  - $prerequisites: direct+transitive prerequisites of the target
 *    in deterministic dependency-first order (resolver order);
 *  - $alreadyEnabled / $toEnable: partition of prerequisites+target
 *    by current activation state; $toEnable keeps dependency-first
 *    order with the target last;
 *  - $availability / $organizationPolicies / $entitlements: per
 *    module in prerequisites+target. Policy is tri-state
 *    ('allowed' | 'denied' | 'none'); entitlement is evaluated for
 *    modules that would be newly enabled;
 *  - $blockingReasons: list of ['module', 'code', 'message'] for
 *    modules that cannot be newly enabled; empty means confirmable;
 *  - $confirmationToken: deterministic hash of the exact state the
 *    preview was computed from (relevant activation state, relevant
 *    organization policies, catalog fingerprint). Recomputed at
 *    confirmation time; any drift makes the preview stale.
 */
final class ModuleActivationPreview
{
    /**
     * @param  list<string>  $prerequisites
     * @param  list<string>  $alreadyEnabled
     * @param  list<string>  $toEnable
     * @param  array<string, bool>  $availability
     * @param  array<string, string>  $organizationPolicies
     * @param  array<string, bool>  $entitlements
     * @param  list<array{module: string, code: string, message: string}>  $blockingReasons
     */
    public function __construct(
        public readonly int $workspaceId,
        public readonly string $moduleKey,
        public readonly array $prerequisites,
        public readonly array $alreadyEnabled,
        public readonly array $toEnable,
        public readonly array $availability,
        public readonly array $organizationPolicies,
        public readonly array $entitlements,
        public readonly array $blockingReasons,
        public readonly string $confirmationToken,
    ) {}

    public function confirmable(): bool
    {
        return $this->blockingReasons === [];
    }

    /** @return list<string> */
    public function blockingCodes(): array
    {
        return array_values(array_map(static fn (array $reason): string => $reason['code'], $this->blockingReasons));
    }
}
