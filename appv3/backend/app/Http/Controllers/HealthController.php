<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

final class HealthController extends Controller
{
    public function health(): JsonResponse
    {
        return response()->json(['status' => 'ok']);
    }
}
