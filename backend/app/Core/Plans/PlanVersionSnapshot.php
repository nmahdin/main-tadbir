<?php

namespace App\Core\Plans;

/**
 * Read-only view of one plan version (Stage C5-1).
 *
 * $entitlements maps module key => allowed for modules the version
 * explicitly decides; a module absent from the map is "not decided"
 * and evaluators must read it as not allowed. $limits maps resource
 * key => ['limit_value' => int, 'is_unlimited' => bool].
 */
final readonly class PlanVersionSnapshot
{
    /**
     * @param  array<string, bool>  $entitlements
     * @param  array<string, array{limit_value: int, is_unlimited: bool}>  $limits
     */
    public function __construct(
        public string $planKey,
        public int $version,
        public int $graceDays,
        public bool $published,
        public ?string $publishedAt,
        public array $entitlements,
        public array $limits,
    ) {}

    public function allowsModule(string $moduleKey): bool
    {
        return $this->entitlements[$moduleKey] ?? false;
    }
}
