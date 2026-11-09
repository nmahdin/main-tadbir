<?php

namespace App\Core\Plans;

/**
 * Canonical registry of plan resource-limit keys (Stage C5-1).
 *
 * Keys name quota DIMENSIONS only (grounded in the approved C5
 * roadmap: member/workspace/storage quota evaluation); the catalog
 * defines no commercial values — every number lives on a versioned
 * plan provisioned explicitly. Unknown keys are rejected: limits
 * may never be written against ad-hoc strings, because C5-3 quota
 * evaluation can only enforce dimensions it knows.
 */
final class PlanResourceCatalog
{
    /** @var array<string, string> key => human label */
    private const RESOURCES = [
        'workspaces' => 'Workspaces per subscription owner',
        'organization_members' => 'Members per organization',
        'workspace_members' => 'Members per workspace',
        // C5-EXT-01 M1: active (non-terminal) projects per owner.
        'projects' => 'Active projects per subscription owner',
        'storage_bytes' => 'Storage in bytes',
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::RESOURCES);
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::RESOURCES);
    }

    public static function assertKnown(string $key): void
    {
        if (! self::has($key)) {
            throw new PlanProvisioningException(
                'unknown_resource_key',
                "Resource key [{$key}] is not a known plan resource.",
            );
        }
    }
}
