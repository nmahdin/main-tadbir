<?php

return [
    /*
    | Google Calendar is optional. Prefer a service-account JSON credential and,
    | for Google Workspace, set delegated_user to an account allowed to create
    | Calendar events. Credentials are read from the environment only.
    */
    'credentials_path' => env('GOOGLE_CALENDAR_CREDENTIALS_PATH'),
    'credentials_json' => env('GOOGLE_CALENDAR_CREDENTIALS_JSON'),
    'access_token' => env('GOOGLE_CALENDAR_ACCESS_TOKEN'),
    'calendar_id' => env('GOOGLE_CALENDAR_ID', 'primary'),
    'delegated_user' => env('GOOGLE_CALENDAR_DELEGATED_USER'),
    'timezone' => env('GOOGLE_CALENDAR_TIMEZONE', 'Asia/Tehran'),
    'send_updates' => env('GOOGLE_CALENDAR_SEND_UPDATES', 'none'),
];
