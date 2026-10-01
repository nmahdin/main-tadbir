<?php

return [
    // Logical organization quota shown in DAM. Override per deployment without code changes.
    'storage_quota_bytes' => (int) env('DAM_STORAGE_QUOTA_BYTES', 10 * 1024 * 1024 * 1024),
];
