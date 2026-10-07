<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** An intern's private reflection on one week; only its writer ever reads it. */
class Reflection extends Model
{
    protected $fillable = ['user_id', 'week_start', 'text'];

    /** @return list<array{week: string, text: string}> */
    public static function listFor(string $userId): array
    {
        return self::query()->where('user_id', $userId)->orderBy('week_start')->get()
            ->map(fn (self $r): array => ['week' => substr((string) $r->week_start, 0, 10), 'text' => (string) $r->text])
            ->values()->all();
    }
}
