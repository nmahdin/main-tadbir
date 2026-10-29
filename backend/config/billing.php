<?php

return [
    /*
     * C5-EXT-01 billing configuration (SPEC-C5-EXT-01, ADR-0022).
     *
     * AMB-C5-01=B: the canonical internal money unit for all NEW
     * commercial records is the Iranian Toman (تومان), stored as
     * integers — never floats. No monetary records exist yet (legacy
     * audit: the schema has no money columns; `projects.budget` is a
     * free-text label, not a financial value). Iranian payment
     * providers may expect Rial or another unit: a later milestone
     * MUST document and implement an explicit conversion boundary at
     * the gateway adapter. Nothing may silently convert units.
     */
    'currency' => 'تومان',
    'currency_code' => env('BILLING_CURRENCY_CODE', 'تومان'),

    // Free-plan foundation (M1). Keys are stable plan identities
    // published by `plans:provision-free`; never rename in place.
    'free' => [
        'personal_plan_key' => env('BILLING_PERSONAL_FREE_PLAN_KEY', env('AUTH_PERSONAL_FREE_PLAN_KEY', 'personal-free')),
        'personal_plan_version' => (int) env('BILLING_PERSONAL_FREE_PLAN_VERSION', env('AUTH_PERSONAL_FREE_PLAN_VERSION', 1)),
        'organization_plan_key' => env('BILLING_ORGANIZATION_FREE_PLAN_KEY', 'organization-free'),
        'organization_plan_version' => (int) env('BILLING_ORGANIZATION_FREE_PLAN_VERSION', 1),
        // Approved default grace (B07) applied to Free plan versions.
        'grace_days' => (int) env('BILLING_FREE_GRACE_DAYS', 7),
    ],

    // AMB-C5-08=A: future quote validity (M3; recorded, not yet used).
    'quote' => [
        'ttl_minutes' => (int) env('BILLING_QUOTE_TTL_MINUTES', 30),
    ],

    // AMB-C5-02=A: provider-neutral gateway, operator-configured
    // licensed PSP (M4; recorded, not yet used). Credentials via env.
    'gateway' => env('BILLING_GATEWAY', 'unavailable'),
];
