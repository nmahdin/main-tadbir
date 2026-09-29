<?php

// Passwords are intentionally unset. Set them privately for the first seed only.
// .invalid addresses are non-deliverable placeholders, not claimed personal addresses.
return [
    'mahdi' => [
        'email' => env('SEED_MAHDI_EMAIL', 'mahdi.nabavi@users.invalid'),
        'password' => env('SEED_MAHDI_PASSWORD'),
    ],
    'emad' => [
        'email' => env('SEED_EMAD_EMAIL', 'emad.hendi@users.invalid'),
        'password' => env('SEED_EMAD_PASSWORD'),
    ],
    'amirali' => [
        'email' => env('SEED_AMIRALI_EMAIL', 'amirali.shirazi@users.invalid'),
        'password' => env('SEED_AMIRALI_PASSWORD'),
    ],
];
