<?php

namespace App\Services;

use App\Models\Placement;
use App\Models\Week;
use App\Support\Problem;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Internship-relative week math.
 *
 * Weeks run Monday to Sunday; the first and last are trimmed to the
 * placement's start and end dates. All date inputs are YYYY-MM-DD.
 */
final class WeekService
{
    /**
     * @return array<int, array{week_number: int, start_date: string, end_date: string}>
     */
    public function buildWeeks(string $startDate, string $endDate): array
    {
        if (! self::isValidDate($startDate) || ! self::isValidDate($endDate) || $endDate < $startDate) {
            return [];
        }

        $weeks = [];
        $cursor = $startDate;
        $number = 1;

        while ($cursor <= $endDate) {
            // Monday to Sunday, like the logbook screens; the first and last weeks are trimmed to the internship.
            $weekEnd = self::addDays(self::mondayOf($cursor), 6);
            if ($weekEnd > $endDate) {
                $weekEnd = $endDate;
            }

            $weeks[] = [
                'week_number' => $number,
                'start_date' => $cursor,
                'end_date' => $weekEnd,
            ];

            $cursor = self::addDays($weekEnd, 1);
            $number++;
        }

        return $weeks;
    }

    /**
     * Lazily materialise every week row for a placement. Idempotent.
     *
     * @return Collection<int, Week>
     */
    public function ensureWeeks(Placement $placement): Collection
    {
        foreach ($this->buildWeeks($placement->start_date, $placement->end_date) as $spec) {
            Week::firstOrCreate(
                ['placement_id' => $placement->id, 'week_number' => $spec['week_number']],
                [
                    'start_date' => $spec['start_date'],
                    'end_date' => $spec['end_date'],
                    'status' => Week::STATUS_NOT_STARTED,
                    // Tied to the placement's version, so a week created by a re-cut never reuses an old week's ETag.
                    'version' => "{$placement->version}.w{$spec['week_number']}-1",
                ]
            );
        }

        return Week::query()
            ->where('placement_id', $placement->id)
            ->orderBy('week_number')
            ->get();
    }

    /**
     * Programme-local "today" (YYYY-MM-DD) for student date math.
     */
    public function programmeToday(Placement $placement): string
    {
        try {
            return Carbon::now($placement->programme_timezone)->toDateString();
        } catch (\Throwable) {
            return Carbon::now('UTC')->toDateString();
        }
    }

    /**
     * Date-only availability: locked until startDate; overdue when the week
     * ended without a submission (derived, never persisted).
     *
     * @return 'locked'|'available'|'overdue'
     */
    public function availability(Week $week, string $today): string
    {
        if ($week->start_date > $today) {
            return 'locked';
        }

        if ($week->end_date < $today && $week->status !== Week::STATUS_SUBMITTED) {
            return 'overdue';
        }

        return 'available';
    }

    /**
     * Monday-Friday dates inside [startDate, endDate].
     *
     * @return array<int, string>
     */
    public function weekdaysIn(string $startDate, string $endDate): array
    {
        if (! self::isValidDate($startDate) || ! self::isValidDate($endDate) || $endDate < $startDate) {
            return [];
        }

        $days = [];
        $cursor = $startDate;

        while ($cursor <= $endDate) {
            if (self::isWeekday($cursor)) {
                $days[] = $cursor;
            }
            $cursor = self::addDays($cursor, 1);
        }

        return $days;
    }

    public static function mondayOf(string $date): string
    {
        return self::addDays($date, 1 - (int) Carbon::createFromFormat('Y-m-d', $date, 'UTC')->dayOfWeekIso);
    }

    /**
     * The prototype's period key for the week that starts on this date: 'w:<Monday>'.
     */
    public static function periodKey(string $startDate): string
    {
        return 'w:'.self::mondayOf($startDate);
    }

    /**
     * Re-cut the weeks after the internship dates change. A week keeps its notes and
     * answers while its Monday is still inside the internship. Refuses (409) rather
     * than drop a note or an answer.
     */
    public function syncWeeks(Placement $placement): void
    {
        $start = substr((string) $placement->start_date, 0, 10);
        $end = substr((string) $placement->end_date, 0, 10);
        $specs = collect($this->buildWeeks($start, $end))
            ->keyBy(fn (array $spec): string => self::mondayOf($spec['start_date']));
        $existing = Week::query()->where('placement_id', $placement->id)->lockForUpdate()->get();
        $mondayOf = fn (Week $week): string => self::mondayOf(substr((string) $week->start_date, 0, 10));

        // A submitted week carries review history and signatures, so it counts as work even when blank.
        $dropsAnswers = $existing->contains(fn (Week $week): bool => ! $specs->has($mondayOf($week)) && (
            $week->submitted_at !== null
            || array_filter($week->answers ?? [], fn (?string $value): bool => trim((string) $value) !== '') !== []
        ));

        if ($dropsAnswers) {
            Problem::throw(
                Response::HTTP_CONFLICT,
                'SETUP_DROPS_WORK',
                'Some of your answers fall outside the new dates. Clear them first, or keep the old dates.'
            );
        }

        // Park every number out of the way so renumbering can't hit the (placement_id, week_number) unique key.
        Week::query()->where('placement_id', $placement->id)->update(['week_number' => DB::raw('week_number + 10000')]);

        foreach ($existing as $week) {
            $spec = $specs->get($mondayOf($week));

            if ($spec === null) {
                $week->delete();

                continue;
            }

            // A query, not save(): save() skips a week_number equal to the in-memory one and would leave it parked.
            Week::query()->whereKey($week->id)->update([...$spec, 'version' => ConcurrencyService::bump($week->version)]);
        }

        $this->ensureWeeks($placement);
    }

    public static function isValidDate(string $value): bool
    {
        if (! preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
            return false;
        }

        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    public static function isWeekday(string $date): bool
    {
        // 1 (Mon) .. 7 (Sun) via UTC-midnight math.
        $day = (int) Carbon::createFromFormat('Y-m-d', $date, 'UTC')->dayOfWeekIso;

        return $day >= 1 && $day <= 5;
    }

    public static function addDays(string $date, int $days): string
    {
        return Carbon::createFromFormat('Y-m-d', $date, 'UTC')->addDays($days)->toDateString();
    }
}
