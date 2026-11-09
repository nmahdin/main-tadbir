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

    // C5-M2 §3.1: service-level maximum whole-Toman amount,
    // comfortably below signed 64-bit max so every multiplication
    // in the pipeline stays inside integer range.
    'max_amount_toman' => (int) env('BILLING_MAX_AMOUNT_TOMAN', 9_000_000_000_000_000),

    // C5-M2-S1: provisional defaults. Pending product-owner
    // ratification; see SPEC-C5-M2 §9.
    'provisional' => [
        'order_review_ttl_days' => (int) env('BILLING_ORDER_REVIEW_TTL_DAYS', 7),
    ],

    // C5-M4: fixed paid term durations (calendar days). Approved
    // baseline per AMB-C5-03; renewal stacks after the current
    // paid end regardless of wall-clock, so drift against Gregorian
    // month boundaries is intentional and kept simple.
    'terms' => [
        'monthly_days' => (int) env('BILLING_MONTHLY_DAYS', 30),
        'quarterly_days' => (int) env('BILLING_QUARTERLY_DAYS', 90),
        'annual_days' => (int) env('BILLING_ANNUAL_DAYS', 365),
        'grace_days' => (int) env('BILLING_PAID_GRACE_DAYS', 7),
    ],
];
