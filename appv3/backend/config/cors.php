<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing
    |--------------------------------------------------------------------------
    |
    | The SPA authenticates with a same-site HttpOnly session cookie and
    | credentials: 'include'. Cross-origin calls are only honoured for the
    | explicitly configured SPA origins, always with credentials.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('FRONTEND_ORIGINS', 'http://localhost:5173'))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['ETag', 'X-Request-Id'],

    'max_age' => 0,

    'supports_credentials' => true,

];
