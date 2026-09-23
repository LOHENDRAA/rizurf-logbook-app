<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Laravel\Sanctum\Sanctum;

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | First-party SPA domains allowed to use Sanctum cookie sessions.
    | Requests from these hosts (plus localhost) receive sessions.
    |
    */

    'stateful' => explode(',', (string) env(
        'SANCTUM_STATEFUL_DOMAINS',
        'localhost,localhost:3000,localhost:5173,localhost:8000,127.0.0.1,127.0.0.1:8000,::1'.Sanctum::currentApplicationUrlWithPort().','.parse_url((string) env('APP_URL', ''), PHP_URL_HOST)
    )),

    'guard' => ['web'],

    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

];
