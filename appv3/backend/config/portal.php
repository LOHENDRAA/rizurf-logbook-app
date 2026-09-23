<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Portal tunables
    |--------------------------------------------------------------------------
    |
    | Rate limits, idempotency horizon, and the local-only demo password.
    |
    */

    'login_rate_per_minute' => (int) env('LOGIN_RATE_LIMIT_PER_MINUTE', 10),

    'api_rate_per_minute' => (int) env('API_RATE_LIMIT_PER_MINUTE', 120),

    'idempotency_ttl_hours' => (int) env('IDEMPOTENCY_TTL_HOURS', 24),

    'demo_password' => (string) env('DEMO_PASSWORD', 'password'),

    'allow_seed_production' => env('ALLOW_SEED_PRODUCTION', false),

];
