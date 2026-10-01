<?php

namespace App\Http\Controllers;

use App\Http\Requests\InternshipRequest;
use App\Http\Resources\PortalResources;
use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\User;
use App\Models\Week;
use App\Services\CapabilityService;
use App\Services\ConcurrencyService;
use App\Services\WeekService;
use App\Support\Problem;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class LogbookController extends Controller
{
    // ponytail: one timezone for interns who set themselves up; take it from the gateway if interns span zones.
    private const TIMEZONE = 'Asia/Kuala_Lumpur';

    public function __construct(
        private readonly WeekService $weeks,
        private readonly CapabilityService $capabilities,
    ) {}

    private function requireStudent(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns have a logbook.');
        }

        return $user;
    }

    private function respond(User $student): JsonResponse
    {
        $placement = Placement::query()->where('student_id', $student->id)->first();
        $weeks = $placement === null ? new Collection : $this->weeks->ensureWeeks($placement);
        $today = $placement === null ? '' : $this->weeks->programmeToday($placement);

        $data = PortalResources::logbook(
            $student,
            $placement,
            $weeks,
            fn (Week $week): array => $this->capabilities->forStudentWeek($week, $today, $this->weeks)
        );
        $data['profile'] = PortalResources::profile($student, $placement);
        $response = response()->json($data);

        return $placement === null ? $response : $response->header('ETag', ConcurrencyService::etagFor($placement->version));
    }

    public function mine(Request $request): JsonResponse
    {
        return $this->respond($this->requireStudent($request));
    }

    public function setup(InternshipRequest $request): JsonResponse
    {
        $user = $this->requireStudent($request);
        $template = LogbookTemplate::query()->findOrFail($request->validated('templateId'));
        $fields = [
            'university_name' => $template->university_name,
            'start_date' => (string) $request->validated('startDate'),
            'end_date' => (string) $request->validated('endDate'),
            // Laravel turns an empty answer into null; the screens expect strings.
            'cover_values' => array_map(strval(...), (array) $request->validated('coverValues')),
        ];
        // Position and programme are free text and never locked; saved only when sent.
        foreach (['position' => 'position', 'programmeName' => 'programme_name'] as $input => $column) {
            if ($request->exists($input)) {
                $fields[$column] = (string) $request->validated($input);
            }
        }

        DB::transaction(function () use ($request, $user, $fields): void {
            $placement = Placement::query()->where('student_id', $user->id)->lockForUpdate()->first();

            if ($placement === null) {
                if ($user->company_id === null) {
                    Problem::throw(Response::HTTP_CONFLICT, 'NO_COMPANY', 'Your account is not linked to a company yet. Ask your supervisor.');
                }

                $placement = new Placement([
                    'programme_name' => '',
                    'position' => '',
                    ...$fields,
                    'id' => (string) Str::uuid(),
                    'student_id' => $user->id,
                    'company_id' => $user->company_id,
                    'programme_timezone' => self::TIMEZONE,
                    'version' => 'p-1',
                ]);
                $placement->save();
                $this->weeks->syncWeeks($placement);

                return;
            }

            ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload your internship and try again.');
            ConcurrencyService::assertMatch($placement, $request->header('If-Match'));

            // Lock the weeks too, so a save or submit in another tab can't slip between these checks and the re-cut.
            Week::query()->where('placement_id', $placement->id)->lockForUpdate()->get();

            $datesChanged = substr((string) $placement->start_date, 0, 10) !== $fields['start_date']
                || substr((string) $placement->end_date, 0, 10) !== $fields['end_date'];

            if (($datesChanged || $placement->university_name !== $fields['university_name']) && $placement->setupLocked()) {
                Problem::throw(Response::HTTP_CONFLICT, 'SETUP_LOCKED', 'You can only change your university or dates before any week is submitted.');
            }

            // Weeks are re-cut only for new dates: re-cutting bumps every week's version, which a cover-only save must not do.
            $placement->fill([...$fields, 'version' => ConcurrencyService::bump($placement->version)])->save();

            if ($datesChanged) {
                $this->weeks->syncWeeks($placement);
            }
        });

        return $this->respond($user);
    }
}
