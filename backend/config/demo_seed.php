<?php

/*
 * Development demo seeder credentials (local/testing ONLY).
 * Values come exclusively from the developer's protected .env;
 * no default or production credential exists in source.
 */
return [
    'platform_password' => env('DEMO_PLATFORM_PASSWORD'),
    'personal_password' => env('DEMO_PERSONAL_PASSWORD'),
    'org_owner_password' => env('DEMO_ORG_OWNER_PASSWORD'),
    'org_member_password' => env('DEMO_ORG_MEMBER_PASSWORD'),
    'org_member2_password' => env('DEMO_ORG_MEMBER2_PASSWORD'),
];
