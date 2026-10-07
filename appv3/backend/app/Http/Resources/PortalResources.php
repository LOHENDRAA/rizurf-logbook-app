<?php

namespace App\Http\Resources;

use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\ReviewAction;
use App\Models\Submission;
use App\Models\User;
use App\Models\Week;
use App\Services\WeekService;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

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
     * The signed-in intern's own details for Overview and My internship; never part of what supervisors read.
     *
     * @return array<string, mixed>
     */
    public static function profile(User $student, ?Placement $placement): array
    {
        return [
            'email' => $student->email,
            'mode' => $student->logbook_mode ?? ($placement === null ? null : 'logbook'),
            'companyName' => $student->company?->name,
            'timeZone' => $placement?->programme_timezone ?: 'Asia/Kuala_Lumpur',
            'position' => $placement?->position ?: null,
            'programme' => $placement?->programme_name ?: null,
            'supervisors' => $student->company_id === null ? [] : User::query()
                ->where('company_id', $student->company_id)
                ->where('role', User::ROLE_SUPERVISOR)
                ->orderBy('name')
                ->get(['name', 'email'])
                ->map(fn (User $u): array => ['name' => $u->name, 'email' => $u->email])
                ->all(),
        ];
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
     * A supervisor gets only what was submitted: no answers before the first submit, and never `autofilled`,
     * the intern's copy of their private journal.
     *
     * @param  array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function weekSummary(Week $week, array $capabilities, bool $forSupervisor = false): array
    {
        $payload = [
            'weekNumber' => (int) $week->week_number,
            'startDate' => substr((string) $week->start_date, 0, 10),
            'endDate' => substr((string) $week->end_date, 0, 10),
            'status' => $week->status,
            'periodKey' => WeekService::periodKey(substr((string) $week->start_date, 0, 10)),
            'fillStatus' => self::fillStatus($week),
            'templateId' => $week->template_id,
            'values' => (object) ($forSupervisor && $week->submitted_at === null ? [] : ($week->answers ?? [])),
            'autofilled' => (object) ($forSupervisor ? [] : ($week->autofilled ?? [])),
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

        return $payload;
    }

    /**
     * @param  array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function weekDetail(Week $week, array $capabilities, bool $forSupervisor = false): array
    {
        $payload = self::weekSummary($week, $capabilities, $forSupervisor);

        if ($week->company_status !== null) {
            $payload['review'] = self::review(
                $week->company_status,
                $week->company_feedback,
                $week->company_reviewed_by,
                $week->company_reviewed_at?->toJSON()
            );
        }

        $payload['history'] = self::history($week);

        return $payload;
    }

    /**
     * Submits and review decisions, oldest first, in the prototype's ReviewAction shape.
     *
     * @return array<int, array<string, string>>
     */
    public static function history(Week $week): array
    {
        $submits = $week->submissions->map(fn (Submission $submission): array => [
            'id' => "s{$submission->id}",
            'action' => 'submit',
            'by' => $submission->submitter->name ?? $submission->submitted_by,
            'at' => (string) $submission->created_at?->toJSON(),
        ]);

        $reviews = $week->reviewActions->map(fn (ReviewAction $action): array => array_filter([
            'id' => "r{$action->id}",
            'action' => $action->decision,
            'by' => $action->reviewer->name ?? $action->reviewer_id,
            'signature' => $action->signature,
            'comment' => $action->feedback,
            'at' => (string) $action->created_at?->toJSON(),
        ], fn (?string $value): bool => $value !== null));

        return $submits->concat($reviews)->sortBy('at')->values()->all();
    }

    /**
     * The prototype's four-state status, derived from the stored workflow columns.
     */
    public static function fillStatus(Week $week): string
    {
        return match (true) {
            $week->status !== Week::STATUS_SUBMITTED => 'draft',
            $week->company_status === Week::REVIEW_APPROVED => 'approved',
            $week->company_status === Week::REVIEW_CHANGES => 'changes_requested',
            default => 'submitted',
        };
    }

    /**
     * One intern's whole logbook: who they are, their setup, and every week.
     *
     * @param  EloquentCollection<int, Week>  $weeks
     * @param  callable(Week): array{canEdit: bool, canSubmit: bool, canReview: bool}  $capabilities
     * @return array<string, mixed>
     */
    public static function logbook(User $student, ?Placement $placement, EloquentCollection $weeks, callable $capabilities, bool $forSupervisor = false): array
    {
        $weeks->load(['submissions.submitter', 'reviewActions.reviewer']);

        return [
            'student' => [
                'id' => $student->id,
                'name' => $student->name,
                'templateId' => LogbookTemplate::forUniversity($placement?->university_name)?->id,
                'startDate' => $placement === null ? null : substr((string) $placement->start_date, 0, 10),
                'endDate' => $placement === null ? null : substr((string) $placement->end_date, 0, 10),
                'coverValues' => (object) ($placement->cover_values ?? []),
                'version' => $placement?->version,
                'canChangeSetup' => $placement === null || ! $placement->setupLocked(),
            ],
            'weeks' => $weeks->map(fn (Week $week): array => self::weekDetail($week, $capabilities($week), $forSupervisor))->values()->all(),
        ];
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
