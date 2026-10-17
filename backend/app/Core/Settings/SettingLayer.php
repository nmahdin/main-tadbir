<?php

namespace App\Core\Settings;

/**
 * Resolution layers for effective settings (C7-2 contract).
 *
 * Precedence, HIGHEST first, applied only where a definition
 * explicitly permits the layer:
 *
 *   1. UserPreference     — presentation/experience only.
 *   2. WorkspaceOverride  — requires the definition's Workspace
 *                           override support AND the owning
 *                           Organization's per-key override policy.
 *   3. OrganizationValue  — the explicit Organization value.
 *   4. PlatformDefault    — the definition's code-declared default.
 *
 * A definition marked `mandatory` expresses a higher-level policy:
 * lower layers may never bypass it (the C7-2 resolver must treat
 * the highest mandatory-bearing layer as the ceiling). Resolution
 * must derive Organization ownership from the persisted Workspace
 * row, never from client input — the same rule as invitations and
 * subscriptions.
 */
enum SettingLayer: string
{
    case UserPreference = 'user_preference';
    case WorkspaceOverride = 'workspace_override';
    case OrganizationValue = 'organization_value';
    case PlatformDefault = 'platform_default';

    /** @return list<self> Layers from highest to lowest precedence. */
    public static function precedence(): array
    {
        return [self::UserPreference, self::WorkspaceOverride, self::OrganizationValue, self::PlatformDefault];
    }
}
