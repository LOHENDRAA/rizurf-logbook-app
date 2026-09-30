<?php

namespace App\Models;

use Database\Factories\PlacementFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property array<string, string|null>|null $cover_values
 */
class Placement extends Model
{
    /** @use HasFactory<PlacementFactory> */
    use HasFactory;

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'id',
        'student_id',
        'company_id',
        'university_name',
        'programme_name',
        'programme_timezone',
        'position',
        'start_date',
        'end_date',
        'cover_values',
        'version',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['cover_values' => 'array'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id', 'id');
    }

    /**
     * @return BelongsTo<Company, $this>
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * @return HasMany<Week, $this>
     */
    public function weeks(): HasMany
    {
        return $this->hasMany(Week::class)->orderBy('week_number');
    }

    /**
     * University and dates are fixed once any week has been submitted, unless the
     * university's template was removed (the screens then ask the intern to pick again).
     */
    public function setupLocked(): bool
    {
        return LogbookTemplate::forUniversity($this->university_name) !== null
            && Week::query()->where('placement_id', $this->id)->whereNotNull('submitted_at')->exists();
    }
}
