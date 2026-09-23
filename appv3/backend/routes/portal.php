<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\MeController;
use App\Http\Controllers\MentorController;
use App\Http\Controllers\StudentWeekController;
use App\Http\Controllers\SupervisorController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Portal API (versioned, Sanctum cookie sessions)
|--------------------------------------------------------------------------
|
| Served from the web stack so the HttpOnly session cookie, CSRF, and
| encrypted cookies all behave exactly like the same-site SPA expects.
| Every response carries X-Request-Id; failures are RFC 9457 problem+json.
|
*/

Route::prefix('api/v1')->middleware('throttle:portal-api')->group(function (): void {
    Route::get('health', [HealthController::class, 'health'])->withoutMiddleware('throttle:portal-api');

    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:login')
        ->withoutMiddleware('throttle:portal-api');

    Route::post('auth/logout', [AuthController::class, 'logout'])->middleware('auth');

    Route::get('me', [MeController::class, 'me'])->middleware('auth');
    Route::get('me/internship', [MeController::class, 'internship'])->middleware('auth');

    Route::get('me/journal/weeks', [StudentWeekController::class, 'index'])->middleware('auth');
    Route::get('me/journal/weeks/{weekNumber}', [StudentWeekController::class, 'show'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::put('me/journal/weeks/{weekNumber}/daily', [StudentWeekController::class, 'updateDaily'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::put('me/journal/weeks/{weekNumber}/weekly-draft', [StudentWeekController::class, 'updateDraft'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::post('me/journal/weeks/{weekNumber}/submit', [StudentWeekController::class, 'submit'])
        ->whereNumber('weekNumber')
        ->middleware('auth');

    Route::get('supervisor/interns', [SupervisorController::class, 'interns'])->middleware('auth');
    Route::get('supervisor/interns/{studentId}/weeks', [SupervisorController::class, 'weeks'])->middleware('auth');
    Route::get('supervisor/interns/{studentId}/weeks/{weekNumber}', [SupervisorController::class, 'show'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::post('supervisor/interns/{studentId}/weeks/{weekNumber}/review', [SupervisorController::class, 'review'])
        ->whereNumber('weekNumber')
        ->middleware('auth');

    Route::get('mentor/mentees', [MentorController::class, 'mentees'])->middleware('auth');
    Route::get('mentor/mentees/{studentId}/weeks', [MentorController::class, 'weeks'])->middleware('auth');
    Route::get('mentor/mentees/{studentId}/weeks/{weekNumber}', [MentorController::class, 'show'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
    Route::post('mentor/mentees/{studentId}/weeks/{weekNumber}/review', [MentorController::class, 'review'])
        ->whereNumber('weekNumber')
        ->middleware('auth');
});
