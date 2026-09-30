<?php

namespace App\Services;

use App\Models\User;
use App\Models\Week;

/**
 * Server-authoritative capability derivation. Every week payload carries the
 * capabilities computed for the requesting role and the current week state;
 * client-side role checks are never trusted.
 */
final class CapabilityService
{
    /**
     * @return array{canEdit: bool, canSubmit: bool, canReview: bool}
     */
    public function forSession(User $user): array
    {
        return $user->role === User::ROLE_STUDENT
            ? ['canEdit' => true, 'canSubmit' => true, 'canReview' => false]
            : ['canEdit' => false, 'canSubmit' => false, 'canReview' => true];
    }

    /**
     * Interns edit a week until they submit it, and again once changes are requested.
     */
    public function studentEditable(Week $week): bool
    {
        return $week->status !== Week::STATUS_SUBMITTED
            || $week->company_status === Week::REVIEW_CHANGES;
    }

    /**
     * @return array{canEdit: bool, canSubmit: bool, canReview: bool}
     */
    public function forStudentWeek(Week $week, string $today, WeekService $weeks): array
    {
        $editable = $weeks->availability($week, $today) !== 'locked' && $this->studentEditable($week);

        return ['canEdit' => $editable, 'canSubmit' => $editable, 'canReview' => false];
    }

    /**
     * @return array{canEdit: bool, canSubmit: bool, canReview: bool}
     */
    public function forSupervisorWeek(Week $week): array
    {
        return [
            'canEdit' => false,
            'canSubmit' => false,
            'canReview' => $week->status === Week::STATUS_SUBMITTED
                && $week->company_status === Week::REVIEW_PENDING,
        ];
    }

    /**
     * @return array{canEdit: bool, canSubmit: bool, canReview: bool}
     */
    public function forQueue(): array
    {
        return ['canEdit' => false, 'canSubmit' => false, 'canReview' => true];
    }
}
