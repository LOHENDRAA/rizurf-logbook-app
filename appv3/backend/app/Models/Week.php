<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property Carbon|null $weekly_draft_updated_at
 * @property Carbon|null $submitted_at
 * @property Carbon|null $company_reviewed_at
 * @property Carbon|null $mentor_reviewed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Week extends Model
{
    public const STATUS_NOT_STARTED = 'not_started';

    public const STATUS_DRAFT = 'draft';

    public const STATUS_SUBMITTED = 'submitted';

    public const REVIEW_PENDING = 'pending';

    public const REVIEW_APPROVED = 'approved';

    public const REVIEW_CHANGES = 'changes_requested';

    protected $fillable = [
        'placement_id',
        'week_number',
        'start_date',
        'end_date',
        'status',
        'version',
        'weekly_draft',
        'weekly_draft_updated_at',
        'submitted_body',
        'submitted_at',
        'company_status',
        'company_feedback',
        'company_reviewed_by',
        'company_reviewed_at',
        'mentor_status',
        'mentor_feedback',
        'mentor_reviewed_by',
        'mentor_reviewed_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'week_number' => 'integer',
            'weekly_draft_updated_at' => 'datetime',
            'submitted_at' => 'datetime',
            'company_reviewed_at' => 'datetime',
            'mentor_reviewed_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Placement, $this>
     */
    public function placement(): BelongsTo
    {
        return $this->belongsTo(Placement::class);
    }

    /**
     * @return HasMany<DailyEntry, $this>
     */
    public function dailyEntries(): HasMany
    {
        return $this->hasMany(DailyEntry::class)->orderBy('date');
    }

    /**
     * @return HasMany<Submission, $this>
     */
    public function submissions(): HasMany
    {
        return $this->hasMany(Submission::class)->orderBy('id');
    }

    /**
     * @return HasMany<ReviewAction, $this>
     */
    public function reviewActions(): HasMany
    {
        return $this->hasMany(ReviewAction::class)->orderBy('id');
    }
}
