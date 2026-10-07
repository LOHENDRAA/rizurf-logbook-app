<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Portal tunables
    |--------------------------------------------------------------------------
    |
    | Rate limits, the idempotency horizon, and the Rizurf gateway.
    |
    */

    'login_rate_per_minute' => (int) env('LOGIN_RATE_LIMIT_PER_MINUTE', 10),
    'summaries_per_day' => (int) env('AI_SUMMARIES_PER_DAY', 20),
    'organizes_per_day' => (int) env('AI_ORGANIZES_PER_DAY', 30),

    'api_rate_per_minute' => (int) env('API_RATE_LIMIT_PER_MINUTE', 120),

    'idempotency_ttl_hours' => (int) env('IDEMPOTENCY_TTL_HOURS', 24),

    /*
    | The Rizurf gateway (MICROAPP_AUTH.md): where people sign in, and the screens'
    | address as registered with it. Both come from .env, never from a request.
    */
    'gateway_url' => rtrim((string) env('GATEWAY_URL', ''), '/'),

    'public_url' => rtrim((string) env('PUBLIC_URL', ''), '/'),

    'allow_seed_production' => env('ALLOW_SEED_PRODUCTION', false),

];
