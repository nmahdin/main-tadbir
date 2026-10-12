<?php

return [
    /*
    | One server-side Google Workspace connection is shared by Drive, Docs,
    | Sheets, Calendar and Meet. The Calendar keys remain fallbacks so existing
    | deployments continue to work while moving to the unified provider.
    */
    'credentials_path' => env('GOOGLE_WORKSPACE_CREDENTIALS_PATH', env('GOOGLE_CALENDAR_CREDENTIALS_PATH')),
    'credentials_json' => env('GOOGLE_WORKSPACE_CREDENTIALS_JSON', env('GOOGLE_CALENDAR_CREDENTIALS_JSON')),
    'access_token' => env('GOOGLE_WORKSPACE_ACCESS_TOKEN', env('GOOGLE_CALENDAR_ACCESS_TOKEN')),
    'delegated_user' => env('GOOGLE_WORKSPACE_DELEGATED_USER', env('GOOGLE_CALENDAR_DELEGATED_USER')),
    'drive_folder_id' => env('GOOGLE_WORKSPACE_DRIVE_FOLDER_ID'),
    'request_timeout' => (int) env('GOOGLE_WORKSPACE_TIMEOUT', 25),
    'max_sheet_rows' => (int) env('GOOGLE_WORKSPACE_MAX_SHEET_ROWS', 5000),
    'max_sheet_cells' => (int) env('GOOGLE_WORKSPACE_MAX_SHEET_CELLS', 200000),
    'max_sheet_payload_bytes' => (int) env('GOOGLE_WORKSPACE_MAX_SHEET_PAYLOAD_BYTES', 8388608),
];
