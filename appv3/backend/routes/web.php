<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'name' => config('app.name'),
        'api' => '/api/v1',
        'health' => '/api/v1/health',
    ]);
});

require __DIR__.'/portal.php';
