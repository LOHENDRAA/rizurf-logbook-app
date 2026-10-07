<?php

namespace Tests\Feature;

use App\Models\LogbookTemplate;
use App\Models\ReviewAction;
use App\Models\Week;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ReviewTest extends TestCase
{
    private function studentSubmit(int $weekNumber, string $answer): void
    {
        $version = $this->fillWeek($weekNumber, ['summary' => $answer]);

        $this->portal('POST', "/api/v1/me/journal/weeks/{$weekNumber}/submit", ['version' => $version], [
            'Idempotency-Key' => $this->idemKey(),
        ])->assertOk();
    }

    private function supervisorReview(string $studentId, int $weekNumber, array $payload, array $headers = [])
    {
        $this->be($this->user('supervisor-1'));

        return $this->portal(
            'POST',
            "/api/v1/supervisor/interns/{$studentId}/weeks/{$weekNumber}/review",
            $payload,
            $headers
        );
    }

    private function weekByNumber(int $weekNumber): Week
    {
        return Week::query()
            ->where('placement_id', 'placement-a')
            ->where('week_number', $weekNumber)
            ->firstOrFail();
    }

    public function test_supervisor_interns_lists_company_scope(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/supervisor/interns');

        $response->assertOk();
        $response->assertJsonPath('meta.total', 2);
        $this->assertSame(
            ['student-1', 'student-3'],
            array_column($response->json('data'), 'studentId')
        );
        $response->assertJsonPath('data.0.capabilities.canReview', true);
    }

    public function test_supervisor_endpoints_forbid_students(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('GET', '/api/v1/supervisor/interns')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_supervisor_cannot_reach_out_of_company_intern(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/supervisor/interns/student-2/weeks')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');

        $this->portal('GET', '/api/v1/supervisor/interns/student-2/weeks/1')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_supervisor_week_detail_derives_review_capability(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/supervisor/interns/student-1/weeks/1');

        $response->assertOk();
        $response->assertHeader('ETag');
        $response->assertJsonPath('status', 'submitted');
        $response->assertJsonPath('fillStatus', 'submitted');
        $response->assertJsonPath('review.status', 'pending');
        $response->assertJsonPath('capabilities', ['canEdit' => false, 'canSubmit' => false, 'canReview' => true]);
    }

    public function test_supervisor_approve_transitions_week(): void
    {
        $this->be($this->user('supervisor-1'));
        $detail = $this->portal('GET', '/api/v1/supervisor/interns/student-1/weeks/1');
        $version = $detail->json('version');

        $response = $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
            'feedback' => 'Great detail.',
        ], ['If-Match' => '"'.$version.'"', 'Idempotency-Key' => $this->idemKey()]);

        $response->assertOk();
        $response->assertHeader('ETag');
        $response->assertJsonPath('review.status', 'approved');
        $response->assertJsonPath('review.feedback', 'Great detail.');
        $response->assertJsonPath('review.reviewedBy', 'supervisor-1');
        $response->assertJsonPath('capabilities.canReview', false);
        $this->assertNotSame($version, $response->json('version'));

        $this->assertDatabaseHas('review_actions', [
            'stage' => 'company',
            'decision' => 'approve',
            'reviewer_id' => 'supervisor-1',
        ]);
    }

    public function test_supervisor_request_changes_requires_feedback(): void
    {
        $this->studentSubmit(4, 'Week four report.');

        $response = $this->supervisorReview('student-1', 4, [
            'decision' => 'request_changes',
            'feedback' => '   ',
        ], ['Idempotency-Key' => $this->idemKey()]);

        $response->assertUnprocessable();
        $response->assertJsonPath('error.code', 'VALIDATION_ERROR');

        $ok = $this->supervisorReview('student-1', 4, [
            'decision' => 'request_changes',
            'feedback' => 'Add concrete examples.',
        ], ['Idempotency-Key' => $this->idemKey()]);
        $ok->assertOk();
        $ok->assertJsonPath('review.status', 'changes_requested');
        $ok->assertJsonPath('review.feedback', 'Add concrete examples.');
    }

    public function test_supervisor_cannot_review_twice_with_409(): void
    {
        $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
        ], ['Idempotency-Key' => $this->idemKey()])->assertOk();

        $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
        ], ['Idempotency-Key' => $this->idemKey()])
            ->assertConflict()
            ->assertJsonPath('error.code', 'TRANSITION_CONFLICT');
    }

    public function test_supervisor_cannot_review_unsubmitted_week_with_409(): void
    {
        $this->supervisorReview('student-1', 2, [
            'decision' => 'approve',
        ], ['Idempotency-Key' => $this->idemKey()])
            ->assertConflict()
            ->assertJsonPath('error.code', 'TRANSITION_CONFLICT');
    }

    public function test_supervisor_review_requires_idempotency_key_with_422(): void
    {
        $this->supervisorReview('student-1', 1, ['decision' => 'approve'])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_ERROR');
    }

    public function test_supervisor_review_replays_identical_retry(): void
    {
        $key = $this->idemKey();

        $first = $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
        ], ['Idempotency-Key' => $key]);
        $first->assertOk();

        $second = $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
        ], ['Idempotency-Key' => $key]);
        $second->assertOk();
        $this->assertSame($first->json('version'), $second->json('version'));

        $this->assertSame(
            1,
            ReviewAction::query()->where('week_id', $this->weekByNumber(1)->id)->count()
        );
    }

    public function test_supervisor_review_rejects_stale_version_with_412(): void
    {
        $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
        ], ['If-Match' => '"stale-version"', 'Idempotency-Key' => $this->idemKey()])
            ->assertStatus(412)
            ->assertJsonPath('error.code', 'STALE_VERSION');
    }

    public function test_review_history_is_immutable(): void
    {
        $seeded = ReviewAction::query()
            ->where('week_id', $this->weekByNumber(3)->id)
            ->firstOrFail();
        $this->assertSame('request_changes', $seeded->decision);
        $this->assertSame('Add concrete examples.', $seeded->feedback);

        $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
            'feedback' => 'Great detail.',
        ], ['Idempotency-Key' => $this->idemKey()])->assertOk();

        // The earlier decision row is untouched by later reviews.
        $this->assertSame('request_changes', $seeded->refresh()->decision);
        $this->assertSame('Add concrete examples.', $seeded->refresh()->feedback);
        $this->assertSame(2, ReviewAction::query()->count());
    }

    public function test_the_mentor_stage_is_gone(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/mentor/mentees')->assertNotFound();
        $this->assertFalse(Schema::hasTable('mentor_assignments'));
        $this->assertFalse(Schema::hasColumn('weeks', 'mentor_status'));
    }

    public function test_approval_is_signed_by_the_signed_in_supervisor(): void
    {
        $response = $this->supervisorReview('student-1', 1, [
            'decision' => 'approve',
            'signature' => 'Someone Else',
        ], ['Idempotency-Key' => $this->idemKey()]);

        $response->assertOk();
        $approval = collect($response->json('history'))->firstWhere('action', 'approve');
        $this->assertSame('Sarah Lim', $approval['signature']);
        $this->assertSame('Sarah Lim', $approval['by']);
        $this->assertDatabaseHas('review_actions', ['decision' => 'approve', 'signature' => 'Sarah Lim']);
    }

    public function test_a_full_review_cycle_is_recorded_in_the_history(): void
    {
        $this->studentSubmit(4, 'First go.');
        $this->supervisorReview('student-1', 4, ['decision' => 'request_changes', 'feedback' => 'Add examples.'], [
            'Idempotency-Key' => $this->idemKey(),
        ])->assertOk();

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/me/journal/weeks/4')
            ->assertJsonPath('fillStatus', 'changes_requested')
            ->assertJsonPath('capabilities.canEdit', true);

        $this->studentSubmit(4, 'Second go, with examples.');
        $approved = $this->supervisorReview('student-1', 4, ['decision' => 'approve'], ['Idempotency-Key' => $this->idemKey()]);

        $approved->assertOk()->assertJsonPath('fillStatus', 'approved');
        $this->assertEqualsCanonicalizing(
            ['submit', 'request_changes', 'submit', 'approve'],
            array_column($approved->json('history'), 'action')
        );
        $this->assertSame('Add examples.', collect($approved->json('history'))->firstWhere('action', 'request_changes')['comment']);
        $this->assertSame('Aisha Rahman', collect($approved->json('history'))->firstWhere('action', 'submit')['by']);

        // Approved weeks are read-only for the intern.
        $this->be($this->user('student-1'));
        $etag = (string) $this->portal('GET', '/api/v1/me/journal/weeks/4')->headers->get('ETag');
        $this->portal('PUT', '/api/v1/me/journal/weeks/4/values', [
            'templateId' => LogbookTemplate::forUniversity('Universiti Teknologi Malaysia')?->id,
            'values' => ['summary' => 'Edit after approval.'],
            'autofilled' => [],
        ], ['If-Match' => $etag])->assertConflict()->assertJsonPath('error.code', 'TRANSITION_CONFLICT');
    }

    public function test_supervisor_reads_an_interns_whole_logbook(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook');

        $response->assertOk()
            ->assertJsonPath('student.name', 'Aisha Rahman')
            ->assertJsonPath('weeks.0.periodKey', 'w:2026-08-03')
            ->assertJsonPath('weeks.0.capabilities.canReview', true)
            ->assertJsonPath('weeks.2.fillStatus', 'changes_requested');
        $this->assertCount(8, $response->json('weeks'));
        $this->assertSame(
            'Add concrete examples.',
            collect($response->json('weeks.2.history'))->firstWhere('action', 'request_changes')['comment']
        );
    }

    public function test_logbooks_stay_inside_the_company_and_the_intern(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-2/logbook')->assertForbidden();

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertForbidden();
        $this->portal('GET', '/api/v1/me/logbook')->assertOk()->assertJsonPath('student.id', 'student-1');
    }

    public function test_each_submit_in_the_history_carries_the_answers_it_sent(): void
    {
        $this->studentSubmit(4, 'First go.');
        $this->supervisorReview('student-1', 4, ['decision' => 'request_changes', 'feedback' => 'Add examples.'], [
            'Idempotency-Key' => $this->idemKey(),
        ])->assertOk();
        $this->studentSubmit(4, 'Second go, with examples.');

        $sent = fn (array $history): array => array_map(
            fn (array $h) => $h['values']['summary'] ?? null,
            array_values(array_filter($history, fn (array $h) => $h['action'] === 'submit')),
        );

        $this->be($this->user('student-1'));
        $this->assertSame(['First go.', 'Second go, with examples.'], $sent($this->portal('GET', '/api/v1/me/journal/weeks/4')->assertOk()->json('history')));

        $this->be($this->user('supervisor-1'));
        $week = collect($this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()->json('weeks'))->firstWhere('weekNumber', 4);
        $this->assertSame(['First go.', 'Second go, with examples.'], $sent($week['history']));
    }

    public function test_a_stored_submission_that_is_not_a_map_gives_empty_values(): void
    {
        $this->studentSubmit(4, 'First go.');
        DB::table('submissions')->update(['submitted_body' => '"just text"']);

        $this->be($this->user('student-1'));
        $history = $this->portal('GET', '/api/v1/me/journal/weeks/4')->assertOk();
        $history->assertJsonPath('history.0.action', 'submit');
        $this->assertStringContainsString('"values":{}', (string) $history->getContent());
    }
}
