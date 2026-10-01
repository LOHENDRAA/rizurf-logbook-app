<?php

use App\Http\Controllers\GatewayController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LogbookController;
use App\Http\Controllers\MeController;
use App\Http\Controllers\StudentWeekController;
use App\Http\Controllers\SupervisorController;
use App\Http\Controllers\TemplateController;
use App\Http\Middleware\GatewaySession;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Portal API (versioned, Sanctum cookie sessions)
|--------------------------------------------------------------------------
|
| Served from the web stack so the HttpOnly session cookie, CSRF, and
| encrypted cookies all behave exactly like the same-site SPA expects.
| Every response carries X-Correlation-ID; failures use the Rizurf error envelope.
|
*/

Route::prefix('api/v1')->middleware(['throttle:portal-api', GatewaySession::class])->group(function (): void {
    Route::get('health', [HealthController::class, 'health'])->withoutMiddleware('throttle:portal-api');
    Route::get('openapi.json', [HealthController::class, 'openapi'])->withoutMiddleware('throttle:portal-api');

    Route::get('auth/sign-in', [GatewayController::class, 'start']); // only builds a URL from config
    Route::post('auth/gateway', [GatewayController::class, 'finish'])
        ->middleware('throttle:login')
        ->withoutMiddleware('throttle:portal-api');

    Route::get('me', [MeController::class, 'me'])->middleware('auth');
    Route::get('me/internship', [MeController::class, 'internship'])->middleware('auth');
    Route::put('me/internship', [LogbookController::class, 'setup'])->middleware('auth');
    Route::get('me/logbook', [LogbookController::class, 'mine'])->middleware('auth');
    Route::get('me/template', [TemplateController::class, 'mine'])->middleware('auth');

    Route::get('me/journal/weeks', [StudentWeekController::class, 'index'])->middleware('auth');
    Route::get('me/journal/weeks/{weekNumber}', [StudentWeekController::class, 'show'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::put('me/journal/weeks/{weekNumber}/daily', [StudentWeekController::class, 'updateDaily'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::put('me/journal/weeks/{weekNumber}/values', [StudentWeekController::class, 'updateValues'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::post('me/journal/weeks/{weekNumber}/submit', [StudentWeekController::class, 'submit'])
        ->whereNumber('weekNumber')
        ->middleware('auth');

    Route::get('supervisor/interns', [SupervisorController::class, 'interns'])->middleware('auth');
    Route::get('supervisor/interns/{studentId}/weeks', [SupervisorController::class, 'weeks'])->middleware('auth');
    Route::get('supervisor/interns/{studentId}/logbook', [SupervisorController::class, 'logbook'])->middleware('auth');
    Route::get('supervisor/interns/{studentId}/weeks/{weekNumber}', [SupervisorController::class, 'show'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::post('supervisor/interns/{studentId}/weeks/{weekNumber}/review', [SupervisorController::class, 'review'])
        ->whereNumber('weekNumber')
        ->middleware('auth');

    Route::get('templates', [TemplateController::class, 'index'])->middleware('auth');
    Route::post('templates', [TemplateController::class, 'store'])->middleware('auth');
    Route::get('templates/{id}', [TemplateController::class, 'show'])->middleware('auth');
    Route::put('templates/{id}', [TemplateController::class, 'update'])->middleware('auth');
    Route::delete('templates/{id}', [TemplateController::class, 'destroy'])->middleware('auth');
    Route::get('templates/{id}/file', [TemplateController::class, 'file'])->middleware('auth');
});
