<?php

namespace App\Core\Settings;

use App\Core\Organizations\Organization;
use App\Core\Workspaces\Workspace;
use App\Models\User;

/**
 * C7-2 handoff contract: effective (inherited) setting resolution.
 *
 * Stage C7-1 deliberately ships this interface WITHOUT an
 * implementation — C7-2 builds the resolver on the C7-1 registry,
 * persisted definitions, explicit-value store, and override
 * policies. Implementations must:
 *
 *  - walk SettingLayer::precedence() and consult a layer ONLY
 *    where the definition permits it (allowed scopes, user
 *    override, Workspace override + Organization policy,
 *    organization-to-workspace inheritance);
 *  - treat `mandatory` definitions as ceilings lower layers
 *    cannot bypass;
 *  - derive the Organization from the persisted Workspace row;
 *  - return the PlatformDefault layer (definition default) when
 *    no permitted explicit value exists — defaults are computed,
 *    never materialized per owner;
 *  - fail closed on ambiguity (missing definitions, owner
 *    mismatch, suspended/ended Organization semantics per C3).
 */
interface EffectiveSettingResolver
{
    /**
     * @return array{value: mixed, layer: SettingLayer, definition: SettingDefinition, has_explicit_value: bool, source: array{owner_type: string|null, owner_id: int|null, legacy: bool}}
     */
    public function resolve(string $key, ?Organization $organization = null, ?Workspace $workspace = null, ?User $user = null): array;
}
