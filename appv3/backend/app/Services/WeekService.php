<?php

namespace App\Services;

use App\Models\Placement;
use App\Models\Week;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Internship-relative week math.
 *
 * Weeks are 7-day chunks from the placement startDate; the final chunk is
 * capped at endDate and may be shorter. All date inputs are YYYY-MM-DD.
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
            $weekEnd = self::addDays($cursor, 6);
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
                    'version' => "v{$spec['week_number']}-1",
                    'weekly_draft' => '',
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
