<?php

namespace App\Models;

use Database\Factories\PlacementFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
    ];

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
     * @return HasMany<MentorAssignment, $this>
     */
    public function mentorAssignments(): HasMany
    {
        return $this->hasMany(MentorAssignment::class, 'student_id', 'student_id');
    }
}
