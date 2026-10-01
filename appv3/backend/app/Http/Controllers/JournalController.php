<?php

namespace App\Http\Controllers;

use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

/**
 * A private journal for people who don't keep a logbook: supervisors, and interns whose university has none.
 * Only the signed-in person's own entries are ever read or written; no route takes someone else's id.
 */
final class JournalController extends Controller
{
    private const TIMEZONE = 'Asia/Kuala_Lumpur';

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $start = $user->journal_start_date;

        return response()->json([
            'startDate' => $start === null ? null : substr((string) $start, 0, 10),
            'university' => $user->journal_university,
            'programme' => $user->journal_programme,
            'position' => $user->journal_position,
            'entries' => JournalEntry::query()->where('user_id', $user->id)->orderBy('date')->get()
                ->map(fn (JournalEntry $e): array => ['date' => substr((string) $e->date, 0, 10), 'text' => (string) $e->body])
                ->all(),
        ]);
    }

    public function save(Request $request, string $date): Response
    {
        Validator::make(['date' => $date], [
            'date' => ['date_format:Y-m-d', 'before_or_equal:'.now(self::TIMEZONE)->toDateString()],
        ], [
            'date.before_or_equal' => "You can't write in your journal for a day that hasn't happened yet.",
        ])->validate();
        $text = (string) $request->validate(['text' => ['present', 'nullable', 'string', 'max:20000']])['text'];

        /** @var User $user */
        $user = $request->user();
        $key = ['user_id' => $user->id, 'date' => $date];
        if (trim($text) === '') {
            JournalEntry::query()->where($key)->delete();
        } else {
            JournalEntry::query()->updateOrCreate($key, ['body' => $text]);
        }

        return response()->noContent();
    }

    public function start(Request $request): Response
    {
        $data = $request->validate([
            'startDate' => ['required', 'date_format:Y-m-d'],
            'university' => ['sometimes', 'nullable', 'string', 'max:120'],
            'programme' => ['sometimes', 'nullable', 'string', 'max:120'],
            'position' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['journal_start_date' => $data['startDate']]);
        foreach (['university', 'programme', 'position'] as $field) {
            if (array_key_exists($field, $data)) {
                $user->forceFill(["journal_{$field}" => $data[$field]]);
            }
        }
        $user->save();

        return response()->noContent();
    }
}
