<?php

namespace App\Core\Modules;

use App\Core\Modules\Contracts\ModuleEntitlementGate;
use App\Core\Workspaces\Workspace;

/**
 * Read-only activation planner (Stage C4-2).
 *
 * Computes a deterministic preview for enabling one module in one
 * Workspace: the full direct+transitive prerequisite closure, the
 * already/newly enabled partition, technical availability,
 * organization policy (tri-state), entitlement outcomes, and
 * blocking reasons. The planner NEVER mutates state and fails
 * closed: unknown modules throw, and any unavailable, policy-denied,
 * or unentitled newly-enabled module blocks confirmation.
 */
final class ModuleActivationPlanner
{
    public function __construct(
        private readonly ModuleDependencyResolver $resolver,
        private readonly ModuleEntitlementGate $entitlements,
    ) {}

    /**
     * @throws ModuleActivationException when the target is unknown
     */
    public function preview(Workspace $workspace, string $moduleKey): ModuleActivationPreview
    {
        $target = ModuleCatalog::get($moduleKey);

        if ($target === null) {
            throw new ModuleActivationException(
                'module_unknown',
                "Module [{$moduleKey}] is not a known module.",
            );
        }

        $prerequisites = $this->resolver->prerequisitesFor($moduleKey); // dependency-first
        $relevant = [...$prerequisites, $moduleKey];

        $enabledKeys = $this->enabledModuleKeys($workspace);
        $policies = $this->policyMap($workspace, $relevant);

        $availability = [];
        $entitlements = [];
        $blocking = [];
        $alreadyEnabled = [];
        $toEnable = [];

        foreach ($relevant as $key) {
            $definition = $this->resolver->definition($key);
            $availability[$key] = $definition !== null && $definition->availability === ModuleAvailability::Available;

            if (in_array($key, $enabledKeys, true)) {
                $alreadyEnabled[] = $key;

                continue;
            }

            $toEnable[] = $key;
            $entitlements[$key] = $this->entitlements->isEntitled($workspace, $key);

            if (! $availability[$key]) {
                $blocking[] = ['module' => $key, 'code' => 'module_unavailable', 'message' => "Module [{$key}] is not technically available."];
            }

            if (($policies[$key] ?? 'none') === 'denied') {
                $blocking[] = ['module' => $key, 'code' => 'organization_policy_denied', 'message' => "Organization policy denies module [{$key}]."];
            }

            if (! $entitlements[$key]) {
                $blocking[] = ['module' => $key, 'code' => 'entitlement_missing', 'message' => "No valid entitlement for module [{$key}]."];
            }
        }

        $token = $this->confirmationToken($workspace, $moduleKey, $relevant, $enabledKeys, $policies);

        return new ModuleActivationPreview(
            workspace->id,
            $moduleKey,
            $prerequisites,
            $alreadyEnabled,
            $toEnable,
            $availability,
            $policies,
            $entitlements,
            $blocking,
            $token,
        );
    }

    /**
     * Deterministic confirmation token over the exact previewed
     * state: relevant activation state + relevant organization
     * policies + the canonical catalog fingerprint. Unrelated
     * Workspace state does not affect the token.
     */
    public function confirmationToken(Workspace $workspace, string $moduleKey, array $relevant, array $enabledKeys, array $policies): string
    {
        $relevantEnabled = array_values(array_intersect($relevant, $enabledKeys));
        sort($relevantEnabled);

        $relevantPolicies = array_intersect_key($policies, array_flip($relevant));
        ksort($relevantPolicies);

        return hash('sha256', (string) json_encode([
            'workspace_id' => $workspace->id,
            'module' => $moduleKey,
            'enabled' => $relevantEnabled,
            'policies' => $relevantPolicies,
            'catalog' => ModuleCatalog::fingerprint(),
        ]));
    }

    /** @return list<string> */
    public function enabledModuleKeys(Workspace $workspace): array
    {
        return WorkspaceModule::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', WorkspaceModule::STATUS_ENABLED)
            ->join('core_modules', 'core_modules.id', '=', 'workspace_modules.module_id')
            ->pluck('core_modules.key')
            ->map(static fn ($key): string => (string) $key)
            ->sort()
            ->values()
            ->all();
    }

    /**
     * @param  list<string>  $moduleKeys
     * @return array<string, string> key => allowed|denied|none
     */
    public function policyMap(Workspace $workspace, array $moduleKeys): array
    {
        $map = array_fill_keys($moduleKeys, 'none');

        if ($workspace->organization_id === null) {
            return $map;
        }

        OrganizationModulePolicy::query()
            ->where('organization_id', $workspace->organization_id)
            ->join('core_modules', 'core_modules.id', '=', 'organization_module_policies.core_module_id')
            ->whereIn('core_modules.key', $moduleKeys)
            ->get(['core_modules.key as module_key', 'organization_module_policies.decision'])
            ->each(function (OrganizationModulePolicy $policy) use (&$map): void {
                $map[$policy->getAttribute('module_key')] = $policy->decision;
            });

        return $map;
    }
}
