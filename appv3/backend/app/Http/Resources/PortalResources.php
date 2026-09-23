<?php

namespace App\Http\Resources;

use App\Models\Placement;
use App\Models\User;
use App\Models\Week;

/**
 * Presenters with field shapes exactly matching openapi/portal.yaml.
 * No extra keys, no renamed fields.
 */
final class PortalResources
{
    /**
     * @param  array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function sessionUser(User $user, array $capabilities): array
    {
        $payload = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'avatar' => $user->avatar ?? '',
            'capabilities' => $capabilities,
        ];

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public static function internship(Placement $placement): array
    {
        return [
            'id' => $placement->id,
            'studentId' => $placement->student_id,
            'companyId' => $placement->company_id,
            'universityName' => $placement->university_name,
            'programmeName' => $placement->programme_name,
            'programmeTimeZone' => $placement->programme_timezone,
            'companyName' => $placement->company->name ?? '',
            'position' => $placement->position,
            'startDate' => substr((string) $placement->start_date, 0, 10),
            'endDate' => substr((string) $placement->end_date, 0, 10),
        ];
    }

    /**
     * @param  array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function weekSummary(Week $week, array $capabilities): array
    {
        $payload = [
            'weekNumber' => (int) $week->week_number,
            'startDate' => substr((string) $week->start_date, 0, 10),
            'endDate' => substr((string) $week->end_date, 0, 10),
            'status' => $week->status,
            'version' => $week->version,
            'capabilities' => $capabilities,
        ];

        if ($week->updated_at !== null) {
            $payload['updatedAt'] = $week->updated_at->toJSON();
        }

        if ($week->submitted_at !== null) {
            $payload['submittedAt'] = $week->submitted_at->toJSON();
        }

        if ($week->company_status !== null) {
            $payload['companyStatus'] = $week->company_status;
        }

        $payload['mentorStatus'] = $week->mentor_status;

        return $payload;
    }

    /**
     * @param  array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function weekDetail(Week $week, array $capabilities): array
    {
        $payload = self::weekSummary($week, $capabilities);

        $dailies = [];
        foreach ($week->dailyEntries as $entry) {
            $daily = [
                'date' => substr((string) $entry->date, 0, 10),
                'body' => (string) $entry->body,
            ];
            if ($entry->updated_at !== null) {
                $daily['updatedAt'] = $entry->updated_at->toJSON();
            }
            $dailies[] = $daily;
        }

        $payload['dailyEntries'] = $dailies;
        $payload['weeklyDraft'] = (string) $week->weekly_draft;

        if ($week->weekly_draft_updated_at !== null) {
            $payload['weeklyDraftUpdatedAt'] = $week->weekly_draft_updated_at->toJSON();
        }

        if ($week->submitted_body !== null) {
            $payload['submittedBody'] = (string) $week->submitted_body;
        }

        if ($week->company_status !== null) {
            $payload['review'] = self::review(
                $week->company_status,
                $week->company_feedback,
                $week->company_reviewed_by,
                $week->company_reviewed_at?->toJSON()
            );
        }

        if ($week->mentor_status !== null) {
            $payload['mentorReview'] = self::review(
                $week->mentor_status,
                $week->mentor_feedback,
                $week->mentor_reviewed_by,
                $week->mentor_reviewed_at?->toJSON()
            );
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public static function review(string $status, ?string $feedback, ?string $reviewedBy, ?string $reviewedAt): array
    {
        $payload = ['status' => $status];

        if ($feedback !== null && $feedback !== '') {
            $payload['feedback'] = $feedback;
        }

        if ($reviewedBy !== null && $reviewedBy !== '') {
            $payload['reviewedBy'] = $reviewedBy;
        }

        if ($reviewedAt !== null && $reviewedAt !== '') {
            $payload['reviewedAt'] = $reviewedAt;
        }

        return $payload;
    }

    /**
     * @param  array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function internSummary(User $student, string $companyName, array $capabilities): array
    {
        $payload = [
            'studentId' => $student->id,
            'name' => $student->name,
            'email' => $student->email,
            'avatar' => $student->avatar ?? '',
            'companyName' => $companyName,
            'capabilities' => $capabilities,
        ];

        return $payload;
    }

    /**
     * @param  array<int, array<string, mixed>>  $data
     * @return array<string, mixed>
     */
    public static function page(array $data, int $page, int $perPage, int $total): array
    {
        return [
            'data' => $data,
            'meta' => ['page' => $page, 'perPage' => $perPage, 'total' => $total],
        ];
    }
}
