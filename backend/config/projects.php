<?php

return [
    /*
    | Stage 04B Projects workspace pilot gates.
    |
    | Workspace-scoped Projects operations engage the central
    | module/policy/entitlement gates through a narrowly scoped pilot
    | policy (App\Modules\Projects\Pilot\PilotGatePolicy). The pilot
    | may affirm the gates only when ALL of these hold:
    |   1. the module is `projects`;
    |   2. this flag is explicitly enabled (PROJECTS_WORKSPACE_PILOT);
    |   3. the application environment is NOT production.
    | In every other case the gates report "unavailable" and the
    | central authorization service fails closed (403). Production
    | therefore stays fail-closed until a real module-activation,
    | organization-policy and subscription-entitlement implementation
    | replaces the pilot policy (Q-01 remains OPEN; no subscription
    | lifecycle is invented here).
    */
    'workspace_pilot' => [
        'enabled' => env('PROJECTS_WORKSPACE_PILOT', false),
    ],
];
