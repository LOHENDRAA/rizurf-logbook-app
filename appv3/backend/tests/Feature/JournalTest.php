<?php

namespace Tests\Feature;

use App\Models\LogbookTemplate;
use App\Models\Submission;
use App\Models\Week;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class JournalTest extends TestCase
{
    private function weekVersion(int $weekNumber): array
    {
        $response = $this->portal('GET', "/api/v1/me/journal/weeks/{$weekNumber}");

        $response->assertOk();

        return [$response->json('version'), $response->headers->get('ETag')];
    }

    public function test_index_returns_paginated_weeks_with_etag(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks');

        $response->assertOk();
        $response->assertHeader('ETag');
        $response->assertJsonPath('meta', ['page' => 1, 'perPage' => 20, 'total' => 8]);
        $response->assertJsonPath('data.0.weekNumber', 1);
        $response->assertJsonPath('data.0.status', 'submitted');
        $response->assertJsonPath('data.1.status', 'draft');
        $this->assertCount(8, $response->json('data'));
    }

    public function test_index_pagination_slices_results(): void
    {
        $this->be($this->user('student-1'));

        $page1 = $this->portal('GET', '/api/v1/me/journal/weeks?per_page=3&page=1');
        $page1->assertOk();
        $page1->assertJsonPath('meta', ['page' => 1, 'perPage' => 3, 'total' => 8]);
        $this->assertCount(3, $page1->json('data'));
        $this->assertSame([1, 2, 3], array_column($page1->json('data'), 'weekNumber'));

        $page3 = $this->portal('GET', '/api/v1/me/journal/weeks?per_page=3&page=3');
        $page3->assertOk();
        $this->assertSame([7, 8], array_column($page3->json('data'), 'weekNumber'));
    }

    public function test_index_rejects_invalid_pagination_with_422_problem(): void
    {
        $this->be($this->user('student-1'));

        foreach (['?per_page=0', '?per_page=101', '?per_page=abc', '?page=0'] as $query) {
            $response = $this->portal('GET', "/api/v1/me/journal/weeks{$query}");

            $response->assertUnprocessable();
            $response->assertJsonPath('error.code', 'VALIDATION_ERROR');
        }
    }

    public function test_index_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/me/journal/weeks');

        $response->assertUnauthorized();
        $response->assertJsonPath('error.code', 'UNAUTHORIZED');
    }

    public function test_index_forbids_non_students(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks');

        $response->assertForbidden();
        $response->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_show_returns_week_detail_with_capabilities(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks/2');

        $response->assertOk();
        $response->assertHeader('ETag');
        $response->assertJsonPath('weekNumber', 2);
        $response->assertJsonPath('startDate', '2026-08-10');
        $response->assertJsonPath('endDate', '2026-08-16');
        $response->assertJsonPath('capabilities', ['canEdit' => true, 'canSubmit' => true, 'canReview' => false]);
        $this->assertSame('"'.$response->json('version').'"', $response->headers->get('ETag'));
    }

    public function test_show_submitted_week_is_read_only_for_student(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks/1');

        $response->assertOk();
        $response->assertJsonPath('status', 'submitted');
        $response->assertJsonPath('capabilities.canEdit', false);
        $response->assertJsonPath('capabilities.canSubmit', false);
        $response->assertJsonPath('fillStatus', 'submitted');
    }

    public function test_show_missing_week_returns_404_problem(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks/99');

        $response->assertNotFound();
        $response->assertJsonPath('error.code', 'RESOURCE_NOT_FOUND');
        $this->assertNotEmpty($response->json('error.correlation_id'));
    }

    public function test_a_week_that_has_not_started_takes_answers_but_not_submit(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));

        Carbon::setTestNow(Carbon::parse('2026-08-05 12:00:00', 'Asia/Kuala_Lumpur'));

        try {
            $detail = $this->portal('GET', '/api/v1/me/journal/weeks/2');
            $detail->assertOk()
                ->assertJsonPath('capabilities.canEdit', true)
                ->assertJsonPath('capabilities.canSubmit', false);

            $version = $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
                'templateId' => $template->id,
                'values' => ['summary' => 'Plan for next week.'],
                'autofilled' => [],
            ], ['If-Match' => (string) $detail->headers->get('ETag')])->assertOk()->json('version');

            $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', ['version' => $version], ['Idempotency-Key' => $this->idemKey()])
                ->assertForbidden()
                ->assertJsonPath('error.code', 'FORBIDDEN');
        } finally {
            Carbon::setTestNow(null);
        }
    }

    public function test_values_save_answers_and_bump_version(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        [$version, $etag] = $this->weekVersion(2);

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
            'templateId' => $template->id,
            'values' => ['ph-1' => 'Built the login form.', 'ph-2' => ''],
            'autofilled' => ['ph-1' => 'Built the login form.'],
        ], ['If-Match' => $etag]);

        $response->assertOk()
            ->assertJsonPath('values', ['ph-1' => 'Built the login form.', 'ph-2' => ''])
            ->assertJsonPath('autofilled', ['ph-1' => 'Built the login form.'])
            ->assertJsonPath('templateId', $template->id)
            ->assertJsonPath('status', 'draft');
        $this->assertNotSame($version, $response->json('version'));
        $this->assertSame('"'.$response->json('version').'"', $response->headers->get('ETag'));
    }

    public function test_values_need_a_current_if_match(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $body = ['templateId' => $template->id, 'values' => ['ph-1' => 'x'], 'autofilled' => []];

        $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', $body)
            ->assertStatus(428)
            ->assertJsonPath('error.code', 'PRECONDITION_REQUIRED');
        $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', $body, ['If-Match' => '"stale-version"'])
            ->assertStatus(412)
            ->assertJsonPath('error.code', 'STALE_VERSION');
    }

    public function test_values_are_locked_while_submitted_and_open_after_changes_requested(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $body = ['templateId' => $template->id, 'values' => ['ph-1' => 'x'], 'autofilled' => []];

        [, $etag] = $this->weekVersion(1);
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/values', $body, ['If-Match' => $etag])
            ->assertConflict()
            ->assertJsonPath('error.code', 'TRANSITION_CONFLICT');

        [, $etag] = $this->weekVersion(3);
        $this->portal('PUT', '/api/v1/me/journal/weeks/3/values', $body, ['If-Match' => $etag])->assertOk();
    }

    public function test_values_must_be_for_the_interns_current_template(): void
    {
        $this->template();
        $other = $this->template('University of Melbourne');
        $this->be($this->user('student-1'));
        [, $etag] = $this->weekVersion(2);

        $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
            'templateId' => $other->id,
            'values' => ['ph-1' => 'x'],
            'autofilled' => [],
        ], ['If-Match' => $etag])->assertConflict()->assertJsonPath('error.code', 'TEMPLATE_CHANGED');
    }

    public function test_values_reject_oversized_or_nested_answers(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        [, $etag] = $this->weekVersion(2);

        foreach ([['ph-1' => str_repeat('x', 5001)], ['ph-1' => ['nested']]] as $values) {
            $this->portal('PUT', '/api/v1/me/journal/weeks/2/values', [
                'templateId' => $template->id,
                'values' => $values,
                'autofilled' => [],
            ], ['If-Match' => $etag])->assertUnprocessable()->assertJsonPath('error.code', 'VALIDATION_ERROR');
        }
    }

    private function submit(int $weekNumber, string $version, ?string $key = null): TestResponse
    {
        return $this->portal('POST', "/api/v1/me/journal/weeks/{$weekNumber}/submit", ['version' => $version], [
            'Idempotency-Key' => $key ?? $this->idemKey(),
        ]);
    }

    private function week(int $weekNumber): Week
    {
        return Week::query()->where('placement_id', 'placement-a')->where('week_number', $weekNumber)->firstOrFail();
    }

    public function test_submit_transitions_draft_to_submitted(): void
    {
        $version = $this->fillWeek(2);

        $this->submit(2, $version)
            ->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('status', 'submitted')
            ->assertJsonPath('fillStatus', 'submitted')
            ->assertJsonPath('review.status', 'pending')
            ->assertJsonPath('capabilities.canEdit', false);

        $submission = Submission::query()->where('week_id', $this->week(2)->id)->sole();
        $this->assertSame(['summary' => 'Final weekly report.'], json_decode($submission->submitted_body, true));
    }

    public function test_submit_rejects_an_unfilled_week_with_422(): void
    {
        $this->template();
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(4);

        $this->submit(4, $version)->assertUnprocessable()->assertJsonPath('error.code', 'VALIDATION_ERROR');
    }

    public function test_submit_rejects_answers_for_a_replaced_template(): void
    {
        $version = $this->fillWeek(2);

        // Step 1's "Replace" deletes the template and creates a new one for the same university.
        LogbookTemplate::query()->delete();
        $this->template();

        $this->submit(2, $version)->assertUnprocessable()->assertJsonPath('error.code', 'VALIDATION_ERROR');
    }

    public function test_submit_requires_idempotency_key_with_422(): void
    {
        $version = $this->fillWeek(2);

        $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', ['version' => $version])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_ERROR');
    }

    public function test_submit_rejects_stale_version_with_412(): void
    {
        $this->fillWeek(2);

        $this->submit(2, 'stale-version')->assertStatus(412)->assertJsonPath('error.code', 'STALE_VERSION');
    }

    public function test_double_submit_conflicts_with_409(): void
    {
        $this->submit(2, $this->fillWeek(2))->assertOk();
        [$newVersion] = $this->weekVersion(2);

        $this->submit(2, $newVersion)->assertConflict()->assertJsonPath('error.code', 'TRANSITION_CONFLICT');
    }

    public function test_submit_replays_identical_idempotent_retry(): void
    {
        $version = $this->fillWeek(2);
        $key = $this->idemKey();

        $first = $this->submit(2, $version, $key)->assertOk();
        $second = $this->submit(2, $version, $key)->assertOk();

        $this->assertSame($first->json('version'), $second->json('version'));
        $this->assertSame(1, Submission::query()->where('week_id', $this->week(2)->id)->count());
    }

    public function test_submit_rejects_reused_key_with_different_payload_with_409(): void
    {
        $version = $this->fillWeek(4);
        $key = $this->idemKey();

        $this->submit(4, $version, $key)->assertOk();
        $this->submit(4, 'another-version', $key)->assertConflict()->assertJsonPath('error.code', 'VERSION_CONFLICT');
    }

    public function test_resubmit_after_changes_requested_reopens_company_review(): void
    {
        $original = Submission::query()->where('week_id', $this->week(3)->id)->firstOrFail();
        $version = $this->fillWeek(3, ['summary' => 'Needs work, now with concrete examples.']);

        $this->submit(3, $version)
            ->assertOk()
            ->assertJsonPath('status', 'submitted')
            ->assertJsonPath('review.status', 'pending');

        // Immutable history: the original snapshot row is untouched, a new one is appended.
        $this->assertSame(2, Submission::query()->where('week_id', $this->week(3)->id)->count());
        $this->assertSame('Needs work.', $original->refresh()->submitted_body);
    }
}
