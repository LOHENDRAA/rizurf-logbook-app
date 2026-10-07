<?php

namespace App\Http\Controllers;

use App\Models\Reflection;
use App\Models\User;
use App\Support\Problem;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\Response;

/** An intern's private weekly reflections. Always the signed-in intern's own; no route takes someone else's id. */
final class ReflectionController extends Controller
{
    public function save(Request $request, string $week): Response
    {
        /** @var User $user */
        $user = $request->user();
        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns keep weekly reflections.');
        }
        Validator::make(['week' => $week], [
            'week' => ['bail', 'date_format:Y-m-d', function (string $attribute, mixed $value, Closure $fail): void {
                if (! Carbon::createFromFormat('Y-m-d', (string) $value)?->isMonday()) {
                    $fail('A reflection week starts on a Monday.');
                }
            }],
        ])->validate();
        $text = trim((string) $request->validate(['text' => ['present', 'nullable', 'string', 'max:5000']])['text']);

        $key = ['user_id' => $user->id, 'week_start' => $week];
        if ($text === '') {
            Reflection::query()->where($key)->delete();
        } else {
            Reflection::query()->updateOrCreate($key, ['text' => $text]);
        }

        return response()->noContent();
    }
}
