<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<int, array<string, mixed>> $placeholders
 * @property array<int, string>|null $page_roles
 * @property int|null $unit_start_block
 */
class LogbookTemplate extends Model
{
    use HasUuids;

    protected $fillable = [
        'university_name',
        'university_key',
        'format',
        'file_name',
        'file_path',
        'placeholders',
        'page_roles',
        'unit_start_block',
        'version',
        'created_by',
        'updated_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'placeholders' => 'array',
            'page_roles' => 'array',
            'unit_start_block' => 'integer',
        ];
    }

    /**
     * Matching key for a university name: " Taylor's  University " and
     * "taylor's university" are the same university.
     */
    public static function keyFor(string $name): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', ' ', trim($name)));
    }

    public static function forUniversity(?string $name): ?self
    {
        if ($name === null || trim($name) === '') {
            return null;
        }

        return self::query()->where('university_key', self::keyFor($name))->first();
    }
}
