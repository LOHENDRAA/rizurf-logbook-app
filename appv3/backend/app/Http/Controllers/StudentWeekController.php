<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\PaginatesPortal;
use App\Http\Requests\SubmitRequest;
use App\Http\Requests\WeekValuesRequest;
use App\Http\Resources\PortalResources;
use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\Submission;
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

final class StudentWeekController extends Controller
{
    use PaginatesPortal;

    public function __construct(
        private readonly WeekService $weeks,
        private readonly CapabilityService $capabilities,
        private readonly IdempotencyService $idempotency,
    ) {}

    private function placementFor(User $user): Placement
    {
        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only students have journals.');
        }

        $placement = Placement::query()
            ->with(['company', 'student'])
            ->where('student_id', $user->id)
            ->first();

        if ($placement === null) {
            Problem::throw(Response::HTTP_NOT_FOUND, 'RESOURCE_NOT_FOUND', 'No placement found for this student.');
        }

        return $placement;
    }

    private function weekFor(Placement $placement, int $weekNumber): Week
    {
        $this->weeks->ensureWeeks($placement);

        $week = Week::query()
            ->with(['placement'])
            ->where('placement_id', $placement->id)
            ->where('week_number', $weekNumber)
            ->first();

        if ($week === null) {
            Problem::throw(Response::HTTP_NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Journal week could not be found.');
        }

        return $week;
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $placement = $this->placementFor($user);
        $all = $this->weeks->ensureWeeks($placement);

        ['page' => $page, 'perPage' => $perPage] = $this->pagination($request);

        $today = $this->weeks->programmeToday($placement);
        $total = $all->count();
        $items = $all->slice(($page - 1) * $perPage, $perPage)->values();

        $data = $items->map(fn (Week $week) => PortalResources::weekSummary(
            $week,
            $this->capabilities->forStudentWeek($week, $today, $this->weeks)
        ))->all();

        $etag = '"'.sha1($all->pluck('version')->implode(',').'|'.$total).'"';

        return response()
            ->json(PortalResources::page($data, $page, $perPage, $total))
            ->header('ETag', $etag);
    }

    public function show(Request $request, int $weekNumber): JsonResponse
    {
        $user = $request->user();
        $placement = $this->placementFor($user);
        $week = $this->weekFor($placement, $weekNumber);

        Gate::authorize('viewAsStudent', $week);

        $today = $this->weeks->programmeToday($placement);

        return response()
            ->json(PortalResources::weekDetail(
                $week,
                $this->capabilities->forStudentWeek($week, $today, $this->weeks)
            ))
            ->header('ETag', ConcurrencyService::etagFor($week->version));
    }

    public function updateValues(WeekValuesRequest $request, int $weekNumber): JsonResponse
    {
        $user = $request->user();
        $placement = $this->placementFor($user);
        $week = $this->weekFor($placement, $weekNumber);

        Gate::authorize('mutateAsStudent', $week);
        ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload the week and try again.');

        $templateId = (string) $request->validated('templateId');

        if ($templateId !== LogbookTemplate::forUniversity($placement->university_name)?->id) {
            Problem::throw(Response::HTTP_CONFLICT, 'TEMPLATE_CHANGED', 'Your university template changed. Reload the page.');
        }

        $today = $this->weeks->programmeToday($placement);

        $detail = DB::transaction(function () use ($request, $week, $templateId, $today): array {
            /** @var Week $locked */
            $locked = Week::query()->whereKey($week->id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'));
            $this->assertEditable($locked);

            // Laravel turns an empty answer into null; the screens expect strings.
            $values = array_map(strval(...), (array) $request->validated('values'));
            $locked->template_id = $templateId;
            $locked->answers = $values;
            $locked->autofilled = array_map(strval(...), (array) $request->validated('autofilled'));

            if ($locked->status !== Week::STATUS_SUBMITTED) {
                $filled = array_filter($values, fn (?string $value): bool => trim((string) $value) !== '');
                $locked->status = $filled === [] ? Week::STATUS_NOT_STARTED : Week::STATUS_DRAFT;
            }

            $locked->version = ConcurrencyService::bump($locked->version);
            $locked->save();
            $locked->load(['placement']);

            return PortalResources::weekDetail($locked, $this->capabilities->forStudentWeek($locked, $today, $this->weeks));
        });

        return response()->json($detail)->header('ETag', ConcurrencyService::etagFor($detail['version']));
    }

    public function submit(SubmitRequest $request, int $weekNumber): JsonResponse
    {
        $user = $request->user();
        $placement = $this->placementFor($user);
        $week = $this->weekFor($placement, $weekNumber);

        Gate::authorize('mutateAsStudent', $week);

        $key = $this->idempotency->requireKey($request->header('Idempotency-Key'));
        $scope = "submit:u:{$user->id}:w:{$week->id}";
        $validated = $request->validated();
        $hash = IdempotencyService::hash('POST', $request->path(), $validated);

        $replay = $this->idempotency->replay($scope, $key, $hash);
        if ($replay !== null) {
            return $this->idempotency->replayResponse($replay);
        }

        ConcurrencyService::assertMatch($week, $request->header('If-Match'), (string) $validated['version']);

        $today = $this->weeks->programmeToday($placement);

        if ($week->start_date > $today) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'This week is locked until its start date.');
        }

        $templateId = LogbookTemplate::forUniversity($placement->university_name)?->id;

        $detail = DB::transaction(function () use ($request, $week, $user, $templateId, $today): array {
            /** @var Week $locked */
            $locked = Week::query()->whereKey($week->id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'), (string) $request->input('version'));
            $this->assertEditable($locked);

            $answers = array_filter($locked->answers ?? [], fn (?string $value): bool => trim((string) $value) !== '');

            // Answers written for a template that has since been replaced don't count.
            if ($answers === [] || $templateId === null || $locked->template_id !== $templateId) {
                Problem::throw(
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                    'VALIDATION_ERROR',
                    'Fill in this week before you submit it.',
                    null,
                    ['values' => ["Fill in at least one field of your university's current template."]]
                );
            }

            $now = Carbon::now();
            $body = (string) json_encode($locked->answers, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $locked->submitted_body = $body;
            $locked->submitted_at = $now;
            $locked->status = Week::STATUS_SUBMITTED;
            // First submit and every resubmit go back to the supervisor; the last feedback is kept.
            $locked->company_status = Week::REVIEW_PENDING;
            $locked->version = ConcurrencyService::bump($locked->version);
            $locked->save();

            Submission::query()->create([
                'week_id' => $locked->id,
                'submitted_body' => $body,
                'version' => $locked->version,
                'submitted_by' => $user->id,
                'created_at' => $now,
            ]);

            $locked->load(['placement']);

            return PortalResources::weekDetail($locked, $this->capabilities->forStudentWeek($locked, $today, $this->weeks));
        });

        $etag = ConcurrencyService::etagFor($detail['version']);
        $this->idempotency->store($scope, $key, $hash, 200, $detail, $etag);

        return response()->json($detail)->header('ETag', $etag);
    }

    private function assertEditable(Week $week): void
    {
        if (! $this->capabilities->studentEditable($week)) {
            Problem::throw(
                Response::HTTP_CONFLICT,
                'TRANSITION_CONFLICT',
                "This week is with your supervisor or already approved, so it can't be changed."
            );
        }
    }
}
