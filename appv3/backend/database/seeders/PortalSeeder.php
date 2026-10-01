<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Placement;
use App\Models\ReviewAction;
use App\Models\Submission;
use App\Models\User;
use App\Models\Week;
use App\Services\WeekService;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Demo workspace mirroring the frontend contract fixtures: fixture identities,
 * placement-a with weeks 1-3 in submitted/draft/changes states, and the
 * supervisor company scope.
 *
 * Blocked in production: demo credentials must never exist there.
 */
class PortalSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->isProduction() && ! config('portal.allow_seed_production')) {
            if ($this->command !== null) {
                $this->command->error('Refusing to seed demo data in production.');
            }
            throw new \RuntimeException('Refusing to seed demo data in production.');
        }

        $nusantara = Company::updateOrCreate(
            ['id' => 'company-nusantara'],
            ['name' => 'Nusantara Digital']
        );

        $merlion = Company::updateOrCreate(
            ['id' => 'company-merlion'],
            ['name' => 'Merlion Systems']
        );

        $users = [
            [
                'id' => 'student-1',
                'name' => 'Aisha Rahman',
                'email' => 'aisha.rahman@student.example.edu',
                'role' => User::ROLE_STUDENT,
                'avatar' => 'AR',
                'company_id' => $nusantara->id,
            ],
            [
                'id' => 'student-3',
                'name' => 'Maya Chen',
                'email' => 'maya.chen@student.example.edu.au',
                'role' => User::ROLE_STUDENT,
                'avatar' => 'MC',
                'company_id' => $nusantara->id,
            ],
            [
                'id' => 'student-2',
                'name' => 'Daniel Lee',
                'email' => 'daniel.lee@student.example.ac.uk',
                'role' => User::ROLE_STUDENT,
                'avatar' => 'DL',
                'company_id' => $merlion->id,
            ],
            [
                'id' => 'supervisor-1',
                'name' => 'Sarah Lim',
                'email' => 'sarah.lim@nusantara.example.com',
                'role' => User::ROLE_SUPERVISOR,
                'avatar' => 'SL',
                'company_id' => $nusantara->id,
            ],
        ];

        foreach ($users as $attributes) {
            User::updateOrCreate(
                ['id' => $attributes['id']],
                $attributes
            );
        }

        $placements = [
            [
                'id' => 'placement-a',
                'student_id' => 'student-1',
                'company_id' => $nusantara->id,
                'university_name' => 'Universiti Teknologi Malaysia',
                'programme_name' => 'BSc Computer Science',
                'programme_timezone' => 'Asia/Kuala_Lumpur',
                'position' => 'Software Engineering Intern',
                'start_date' => '2026-08-03',
                'end_date' => '2026-09-27',
            ],
            [
                'id' => 'placement-c',
                'student_id' => 'student-3',
                'company_id' => $nusantara->id,
                'university_name' => 'University of Melbourne',
                'programme_name' => 'BSc Computer Science',
                'programme_timezone' => 'Australia/Sydney',
                'position' => 'Software Engineering Intern',
                'start_date' => '2026-08-03',
                'end_date' => '2026-09-27',
            ],
            [
                'id' => 'placement-b',
                'student_id' => 'student-2',
                'company_id' => $merlion->id,
                'university_name' => 'Imperial College London',
                'programme_name' => 'MEng Computing',
                'programme_timezone' => 'Europe/London',
                'position' => 'Backend Intern',
                'start_date' => '2026-08-03',
                'end_date' => '2026-09-27',
            ],
        ];

        foreach ($placements as $attributes) {
            Placement::updateOrCreate(['id' => $attributes['id']], $attributes);
        }

        $service = app(WeekService::class);

        /** @var Placement $placementA */
        $placementA = Placement::query()->findOrFail('placement-a');
        $service->ensureWeeks($placementA);

        $this->seedWeekState($placementA, 1, [
            'status' => Week::STATUS_SUBMITTED,
            'answers' => ['summary' => 'Seeded weekly report.'],
            'submitted_body' => 'Seeded weekly report.',
            'submitted_at' => Carbon::parse('2026-08-09 10:00:00', 'Asia/Kuala_Lumpur'),
            'company_status' => Week::REVIEW_PENDING,
        ]);

        $this->seedWeekState($placementA, 2, [
            'status' => Week::STATUS_DRAFT,
            'answers' => ['summary' => 'In-progress draft.'],
        ]);

        $this->seedWeekState($placementA, 3, [
            'status' => Week::STATUS_SUBMITTED,
            'answers' => ['summary' => 'Needs work.'],
            'submitted_body' => 'Needs work.',
            'submitted_at' => Carbon::parse('2026-08-23 10:00:00', 'Asia/Kuala_Lumpur'),
            'company_status' => Week::REVIEW_CHANGES,
            'company_feedback' => 'Add concrete examples.',
            'company_reviewed_by' => 'supervisor-1',
            'company_reviewed_at' => Carbon::parse('2026-08-24 10:00:00', 'Asia/Kuala_Lumpur'),
        ]);

        $week1 = Week::query()
            ->where('placement_id', 'placement-a')
            ->where('week_number', 1)
            ->firstOrFail();

        Submission::query()->firstOrCreate(
            ['week_id' => $week1->id, 'version' => $week1->version],
            [
                'submitted_body' => 'Seeded weekly report.',
                'submitted_by' => 'student-1',
                'created_at' => Carbon::parse('2026-08-09 10:00:00', 'Asia/Kuala_Lumpur'),
            ]
        );

        $week3 = Week::query()
            ->where('placement_id', 'placement-a')
            ->where('week_number', 3)
            ->firstOrFail();

        Submission::query()->firstOrCreate(
            ['week_id' => $week3->id, 'version' => $week3->version],
            [
                'submitted_body' => 'Needs work.',
                'submitted_by' => 'student-1',
                'created_at' => Carbon::parse('2026-08-23 10:00:00', 'Asia/Kuala_Lumpur'),
            ]
        );

        ReviewAction::query()->firstOrCreate(
            [
                'week_id' => $week3->id,
                'stage' => ReviewAction::STAGE_COMPANY,
                'decision' => 'request_changes',
            ],
            [
                'feedback' => 'Add concrete examples.',
                'reviewer_id' => 'supervisor-1',
                'created_at' => Carbon::parse('2026-08-24 10:00:00', 'Asia/Kuala_Lumpur'),
            ]
        );
    }

    /**
     * @param  array<string, mixed>  $state
     */
    private function seedWeekState(Placement $placement, int $weekNumber, array $state): void
    {
        /** @var Week $week */
        $week = Week::query()
            ->where('placement_id', $placement->id)
            ->where('week_number', $weekNumber)
            ->firstOrFail();

        $week->fill($state);
        $week->version = "v{$weekNumber}-1";
        $week->save();
    }
}
