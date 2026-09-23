<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\PaginatesPortal;
use App\Http\Requests\ReviewRequest;
use App\Http\Resources\PortalResources;
use App\Models\MentorAssignment;
use App\Models\Placement;
use App\Models\ReviewAction;
use App\Models\User;
use App\Models\Week;
use App\Services\CapabilityService;
use App\Services\ConcurrencyService;
use App\Services\IdempotencyService;
use App\Services\WeekService;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

final class MentorController extends Controller
{
    use PaginatesPortal;

    public function __construct(
        private readonly WeekService $weeks,
        private readonly CapabilityService $capabilities,
        private readonly IdempotencyService $idempotency,
    ) {}

    private function requireMentor(Request $request): User
    {
        $user = $request->user();

        if (! $user->isMentor()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only mentors can view this queue.');
        }

        return $user;
    }

    private function placementInScope(User $mentor, string $studentId): Placement
    {
        $placement = Placement::query()
            ->with(['company', 'student'])
            ->where('student_id', $studentId)
            ->first();

        $assigned = $placement !== null && MentorAssignment::query()
            ->where('mentor_id', $mentor->id)
            ->where('student_id', $studentId)
            ->exists();

        if (! $assigned) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'This intern is not assigned to you.');
        }

        return $placement;
    }

    private function weekInScope(Placement $placement, int $weekNumber): Week
    {
        $this->weeks->ensureWeeks($placement);

        $week = Week::query()
            ->with(['dailyEntries', 'placement'])
            ->where('placement_id', $placement->id)
            ->where('week_number', $weekNumber)
            ->first();

        if ($week === null) {
            Problem::throw(Response::HTTP_NOT_FOUND, 'NOT_FOUND', 'Journal week could not be found.');
        }

        return $week;
    }

    public function mentees(Request $request): JsonResponse
    {
        $mentor = $this->requireMentor($request);

        ['page' => $page, 'perPage' => $perPage] = $this->pagination($request);

        $studentIds = MentorAssignment::query()
            ->where('mentor_id', $mentor->id)
            ->pluck('student_id');

        $placements = Placement::query()
            ->with(['company', 'student'])
            ->whereIn('student_id', $studentIds)
            ->get()
            ->sortBy(fn (Placement $placement) => $placement->student->name ?? $placement->student_id)
            ->values();

        $total = $placements->count();
        $items = $placements->slice(($page - 1) * $perPage, $perPage)->values();

        $data = $items->map(fn (Placement $placement) => PortalResources::internSummary(
            $placement->student,
            $placement->company->name ?? '',
            $this->capabilities->forQueue()
        ))->all();

        return response()->json(PortalResources::page($data, $page, $perPage, $total));
    }

    public function weeks(Request $request, string $studentId): JsonResponse
    {
        $mentor = $this->requireMentor($request);
        $placement = $this->placementInScope($mentor, $studentId);

        ['page' => $page, 'perPage' => $perPage] = $this->pagination($request);

        $all = $this->weeks->ensureWeeks($placement);
        $total = $all->count();
        $items = $all->slice(($page - 1) * $perPage, $perPage)->values();

        $data = $items->map(fn (Week $week) => PortalResources::weekSummary(
            $week,
            $this->capabilities->forMentorWeek($week)
        ))->all();

        return response()->json(PortalResources::page($data, $page, $perPage, $total));
    }

    public function show(Request $request, string $studentId, int $weekNumber): JsonResponse
    {
        $mentor = $this->requireMentor($request);
        $placement = $this->placementInScope($mentor, $studentId);
        $week = $this->weekInScope($placement, $weekNumber);

        Gate::authorize('viewAsMentor', $week);

        return response()
            ->json(PortalResources::weekDetail($week, $this->capabilities->forMentorWeek($week)))
            ->header('ETag', ConcurrencyService::etagFor($week->version));
    }

    public function review(ReviewRequest $request, string $studentId, int $weekNumber): JsonResponse
    {
        $validated = $request->validated();

        $mentor = $this->requireMentor($request);
        $placement = $this->placementInScope($mentor, $studentId);
        $week = $this->weekInScope($placement, $weekNumber);

        Gate::authorize('reviewAsMentor', $week);

        $key = $this->idempotency->requireKey($request->header('Idempotency-Key'));
        $scope = "review-mentor:u:{$mentor->id}:w:{$week->id}";
        $hash = IdempotencyService::hash('POST', $request->path(), $validated);

        $replay = $this->idempotency->replay($scope, $key, $hash);
        if ($replay !== null) {
            return $this->idempotency->replayResponse($replay);
        }

        ConcurrencyService::assertMatch($week, $request->header('If-Match'));

        $detail = DB::transaction(function () use ($request, $week, $mentor, $validated): array {
            /** @var Week $locked */
            $locked = Week::query()->whereKey($week->id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'));

            $eligible = $locked->status === Week::STATUS_SUBMITTED
                && $locked->company_status === Week::REVIEW_APPROVED
                && ($locked->mentor_status === null || $locked->mentor_status === Week::REVIEW_PENDING);

            if (! $eligible) {
                Problem::throw(
                    Response::HTTP_CONFLICT,
                    'TRANSITION_CONFLICT',
                    'This week is awaiting company review.'
                );
            }

            $decision = (string) $validated['decision'];
            $feedback = isset($validated['feedback']) ? trim((string) $validated['feedback']) : '';

            if ($decision === 'request_changes' && $feedback === '') {
                Problem::throw(
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                    'VALIDATION_FAILED',
                    'Feedback is required to request changes.',
                    null,
                    ['feedback' => ['Feedback is required when requesting changes.']]
                );
            }

            $now = Carbon::now();

            // A mentor rejection restarts company review: the stored company
            // decision stays approved (immutable history) while the intern
            // revises; resubmission returns the company to pending.
            if ($decision === 'approve') {
                $locked->mentor_status = Week::REVIEW_APPROVED;
                $locked->mentor_feedback = $feedback === '' ? null : $feedback;
            } else {
                $locked->mentor_status = Week::REVIEW_CHANGES;
                $locked->mentor_feedback = $feedback;
            }

            $locked->mentor_reviewed_by = $mentor->id;
            $locked->mentor_reviewed_at = $now;
            $locked->version = ConcurrencyService::bump($locked->version);
            $locked->save();

            ReviewAction::query()->create([
                'week_id' => $locked->id,
                'stage' => ReviewAction::STAGE_MENTOR,
                'decision' => $decision,
                'feedback' => $feedback === '' ? null : $feedback,
                'reviewer_id' => $mentor->id,
                'created_at' => $now,
            ]);

            $locked->load(['dailyEntries', 'placement']);

            return PortalResources::weekDetail($locked, $this->capabilities->forMentorWeek($locked));
        });

        $etag = ConcurrencyService::etagFor($detail['version']);
        $this->idempotency->store($scope, $key, $hash, 200, $detail, $etag);

        return response()->json($detail)->header('ETag', $etag);
    }
}
