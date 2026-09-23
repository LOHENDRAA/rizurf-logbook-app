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
     * Dual-stage student edit gate: editable while unsubmitted, on the company
     * revision path, or on the pre-resubmit mentor revision path (company
     * still approved + mentor changes requested). Post-resubmit weeks (company
     * pending + mentor changes requested) stay locked awaiting the company.
     */
    public function studentEditable(Week $week): bool
    {
        if ($week->status !== Week::STATUS_SUBMITTED) {
            return true;
        }

        if ($week->company_status === Week::REVIEW_CHANGES) {
            return true;
        }

        return $week->company_status === Week::REVIEW_APPROVED
            && $week->mentor_status === Week::REVIEW_CHANGES;
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
    public function forMentorWeek(Week $week): array
    {
        return [
            'canEdit' => false,
            'canSubmit' => false,
            'canReview' => $week->status === Week::STATUS_SUBMITTED
                && $week->company_status === Week::REVIEW_APPROVED
                && ($week->mentor_status === null || $week->mentor_status === Week::REVIEW_PENDING),
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
