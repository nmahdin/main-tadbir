<?php

return [
    /*
    | The file store keeps operational counters independent from the primary
    | database, so the status page still works while the database is degraded.
    | Tests may switch this to the in-memory array store.
    */
    'metrics_store' => env(
        'SYSTEM_METRICS_STORE',
        env('CACHE_STORE') === 'array' ? 'array' : 'file',
    ),
];
