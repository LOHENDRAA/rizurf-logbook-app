<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable submission snapshot: one row per submit/resubmit, never updated.
 */
class Submission extends Model
{
    public $timestamps = false;

    protected $fillable = ['week_id', 'submitted_body', 'version', 'submitted_by', 'created_at'];

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
