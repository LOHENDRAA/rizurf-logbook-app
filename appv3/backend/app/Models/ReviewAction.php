<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable review decision log: one row per approve/request-changes action.
 */
class ReviewAction extends Model
{
    public const STAGE_COMPANY = 'company';

    public const STAGE_MENTOR = 'mentor';

    public $timestamps = false;

    protected $fillable = ['week_id', 'stage', 'decision', 'feedback', 'reviewer_id', 'created_at'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    /**
     * @return BelongsTo<Week, $this>
     */
    public function week(): BelongsTo
    {
        return $this->belongsTo(Week::class);
    }
}
