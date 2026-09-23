<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\PaginatesPortal;
use App\Http\Requests\ReviewRequest;
use App\Http\Resources\PortalResources;
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

final class SupervisorController extends Controller
{
    use PaginatesPortal;

    public function __construct(
        private readonly WeekService $weeks,
        private readonly CapabilityService $capabilities,
        private readonly IdempotencyService $idempotency,
    ) {}

    private function requireSupervisor(Request $request): User
    {
        $user = $request->user();

        if (! $user->isSupervisor()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only supervisors can view this queue.');
        }

        return $user;
    }

    private function placementInScope(User $supervisor, string $studentId): Placement
    {
        $placement = Placement::query()
            ->with(['company', 'student'])
            ->where('student_id', $studentId)
            ->first();

        if ($placement === null
            || $supervisor->company_id === null
            || $placement->company_id !== $supervisor->company_id
        ) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'This intern is not in your company.');
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

    public function interns(Request $request): JsonResponse
    {
        $supervisor = $this->requireSupervisor($request);

        ['page' => $page, 'perPage' => $perPage] = $this->pagination($request);

        $placements = Placement::query()
            ->with(['company', 'student'])
            ->where('company_id', $supervisor->company_id)
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
        $supervisor = $this->requireSupervisor($request);
        $placement = $this->placementInScope($supervisor, $studentId);

        ['page' => $page, 'perPage' => $perPage] = $this->pagination($request);

        $all = $this->weeks->ensureWeeks($placement);
        $total = $all->count();
        $items = $all->slice(($page - 1) * $perPage, $perPage)->values();

        $data = $items->map(fn (Week $week) => PortalResources::weekSummary(
            $week,
            $this->capabilities->forSupervisorWeek($week)
        ))->all();

        return response()->json(PortalResources::page($data, $page, $perPage, $total));
    }

    public function show(Request $request, string $studentId, int $weekNumber): JsonResponse
    {
        $supervisor = $this->requireSupervisor($request);
        $placement = $this->placementInScope($supervisor, $studentId);
        $week = $this->weekInScope($placement, $weekNumber);

        Gate::authorize('viewAsSupervisor', $week);

        return response()
            ->json(PortalResources::weekDetail($week, $this->capabilities->forSupervisorWeek($week)))
            ->header('ETag', ConcurrencyService::etagFor($week->version));
    }

    public function review(ReviewRequest $request, string $studentId, int $weekNumber): JsonResponse
    {
        $validated = $request->validated();

        $supervisor = $this->requireSupervisor($request);
        $placement = $this->placementInScope($supervisor, $studentId);
        $week = $this->weekInScope($placement, $weekNumber);

        Gate::authorize('reviewAsSupervisor', $week);

        $key = $this->idempotency->requireKey($request->header('Idempotency-Key'));
        $scope = "review-company:u:{$supervisor->id}:w:{$week->id}";
        $hash = IdempotencyService::hash('POST', $request->path(), $validated);

        $replay = $this->idempotency->replay($scope, $key, $hash);
        if ($replay !== null) {
            return $this->idempotency->replayResponse($replay);
        }

        ConcurrencyService::assertMatch($week, $request->header('If-Match'));

        $detail = DB::transaction(function () use ($request, $week, $supervisor, $validated): array {
            /** @var Week $locked */
            $locked = Week::query()->whereKey($week->id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'));

            if ($locked->status !== Week::STATUS_SUBMITTED
                || $locked->company_status !== Week::REVIEW_PENDING
            ) {
                Problem::throw(
                    Response::HTTP_CONFLICT,
                    'TRANSITION_CONFLICT',
                    'Only submitted entries awaiting company review can be reviewed.'
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

            if ($decision === 'approve') {
                $locked->company_status = Week::REVIEW_APPROVED;
                $locked->company_feedback = $feedback === '' ? null : $feedback;
            } else {
                $locked->company_status = Week::REVIEW_CHANGES;
                $locked->company_feedback = $feedback;
            }

            $locked->company_reviewed_by = $supervisor->id;
            $locked->company_reviewed_at = $now;
            $locked->version = ConcurrencyService::bump($locked->version);
            $locked->save();

            ReviewAction::query()->create([
                'week_id' => $locked->id,
                'stage' => ReviewAction::STAGE_COMPANY,
                'decision' => $decision,
                'feedback' => $feedback === '' ? null : $feedback,
                'reviewer_id' => $supervisor->id,
                'created_at' => $now,
            ]);

            $locked->load(['dailyEntries', 'placement']);

            return PortalResources::weekDetail($locked, $this->capabilities->forSupervisorWeek($locked));
        });

        $etag = ConcurrencyService::etagFor($detail['version']);
        $this->idempotency->store($scope, $key, $hash, 200, $detail, $etag);

        return response()->json($detail)->header('ETag', $etag);
    }
}
