<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One of an intern's own projects; a journal day points at it once its project suggestion is accepted. */
class Project extends Model
{
    protected $fillable = ['user_id', 'name', 'name_key', 'description'];

    public static function keyOf(string $name): string
    {
        return mb_strtolower(trim($name));
    }

    /** @return array{id: string, name: string, description: ?string} */
    public function toApi(): array
    {
        return ['id' => (string) $this->id, 'name' => (string) $this->name, 'description' => $this->description];
    }

    /** @return list<array{id: string, name: string, description: ?string}> */
    public static function listFor(string $userId): array
    {
        return self::query()->where('user_id', $userId)->orderBy('name')->get()
            ->map(fn (self $p): array => $p->toApi())->values()->all();
    }
}
