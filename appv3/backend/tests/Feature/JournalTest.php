<?php

namespace Tests\Feature;

use App\Models\Submission;
use App\Models\Week;
use Illuminate\Support\Carbon;
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
            $response->assertJsonPath('code', 'VALIDATION_FAILED');
            $response->assertJsonPath('status', 422);
        }
    }

    public function test_index_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/me/journal/weeks');

        $response->assertUnauthorized();
        $response->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    public function test_index_forbids_non_students(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks');

        $response->assertForbidden();
        $response->assertJsonPath('code', 'FORBIDDEN');
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
        $response->assertJsonPath('submittedBody', 'Seeded weekly report.');
    }

    public function test_show_missing_week_returns_404_problem(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('GET', '/api/v1/me/journal/weeks/99');

        $response->assertNotFound();
        $response->assertJsonPath('code', 'NOT_FOUND');
        $this->assertArrayHasKey('requestId', $response->json());
    }

    public function test_update_daily_saves_entry_and_bumps_version(): void
    {
        $this->be($this->user('student-1'));
        [$version, $etag] = $this->weekVersion(2);

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', [
            'date' => '2026-08-12',
            'body' => 'Shipped the login form.',
        ], ['If-Match' => $etag]);

        $response->assertOk();
        $response->assertJsonPath('date', '2026-08-12');
        $response->assertJsonPath('body', 'Shipped the login form.');
        $this->assertNotSame($version, $response->json('version'));
        $this->assertSame('"'.$response->json('version').'"', $response->headers->get('ETag'));

        $this->assertDatabaseHas('daily_entries', [
            'date' => '2026-08-12',
            'body' => 'Shipped the login form.',
        ]);
    }

    public function test_update_daily_stays_editable_after_submission(): void
    {
        $this->be($this->user('student-1'));
        [, $etag] = $this->weekVersion(1);

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', [
            'date' => '2026-08-05',
            'body' => 'Retro note after submit.',
        ], ['If-Match' => $etag]);

        $response->assertOk();
        $response->assertJsonPath('body', 'Retro note after submit.');
    }

    public function test_update_daily_rejects_weekend_with_422(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', [
            'date' => '2026-08-15', // Saturday
            'body' => 'Weekend work.',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_update_daily_rejects_date_outside_week_with_422(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', [
            'date' => '2026-08-17', // Monday of week 3
            'body' => 'Wrong week.',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_update_daily_rejects_future_date_with_403(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/8/daily', [
            'date' => '2026-09-22', // Tuesday after programme today (2026-09-21)
            'body' => 'From the future.',
        ]);

        $response->assertForbidden();
        $response->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_update_daily_rejects_stale_version_with_412(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', [
            'date' => '2026-08-12',
            'body' => 'Stale write.',
        ], ['If-Match' => '"stale-version"']);

        $response->assertStatus(412);
        $response->assertJsonPath('code', 'STALE_VERSION');
    }

    public function test_locked_week_blocks_daily_draft_and_submit(): void
    {
        $this->be($this->user('student-1'));

        Carbon::setTestNow(Carbon::parse('2026-08-05 12:00:00', 'Asia/Kuala_Lumpur'));

        try {
            $detail = $this->portal('GET', '/api/v1/me/journal/weeks/2');
            $detail->assertOk();
            $detail->assertJsonPath('capabilities.canEdit', false);

            $this->portal('PUT', '/api/v1/me/journal/weeks/2/daily', [
                'date' => '2026-08-12',
                'body' => 'Too early.',
            ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');

            $this->portal('PUT', '/api/v1/me/journal/weeks/2/weekly-draft', [
                'draft' => 'Too early.',
            ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');

            $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
                'draft' => 'Too early.',
                'version' => $detail->json('version'),
            ], ['Idempotency-Key' => $this->idemKey()])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
        } finally {
            Carbon::setTestNow(null);
        }
    }

    public function test_update_draft_saves_and_bumps_version(): void
    {
        $this->be($this->user('student-1'));
        [$version, $etag] = $this->weekVersion(2);

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/weekly-draft', [
            'draft' => 'Updated weekly narrative.',
        ], ['If-Match' => $etag]);

        $response->assertOk();
        $response->assertJsonPath('draft', 'Updated weekly narrative.');
        $this->assertNotSame($version, $response->json('version'));
    }

    public function test_update_draft_rejects_overlong_text_with_422(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/2/weekly-draft', [
            'draft' => str_repeat('x', 5001),
        ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_update_draft_on_submitted_week_conflicts_with_409(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/1/weekly-draft', [
            'draft' => 'Sneaky edit while pending.',
        ]);

        $response->assertConflict();
        $response->assertJsonPath('code', 'TRANSITION_CONFLICT');
    }

    public function test_update_draft_allowed_on_changes_requested_week(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('PUT', '/api/v1/me/journal/weeks/3/weekly-draft', [
            'draft' => 'Revised with concrete examples.',
        ]);

        $response->assertOk();
        $response->assertJsonPath('draft', 'Revised with concrete examples.');
    }

    public function test_submit_transitions_draft_to_submitted(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(2);

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => $version,
        ], ['If-Match' => '"'.$version.'"', 'Idempotency-Key' => $this->idemKey()]);

        $response->assertOk();
        $response->assertHeader('ETag');
        $response->assertJsonPath('status', 'submitted');
        $response->assertJsonPath('submittedBody', 'Final weekly report.');
        $response->assertJsonPath('review.status', 'pending');
        $response->assertJsonPath('capabilities.canEdit', false);

        $week = Week::query()->where('placement_id', 'placement-a')->where('week_number', 2)->firstOrFail();
        $this->assertSame(1, Submission::query()->where('week_id', $week->id)->count());
    }

    public function test_submit_rejects_empty_draft_with_422(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(2);

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => '   ',
            'version' => $version,
        ], ['Idempotency-Key' => $this->idemKey()]);

        $response->assertUnprocessable();
        $response->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_submit_requires_idempotency_key_with_422(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(2);

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => $version,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('code', 'VALIDATION_FAILED');
    }

    public function test_submit_rejects_stale_version_with_412(): void
    {
        $this->be($this->user('student-1'));

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => 'stale-version',
        ], ['If-Match' => '"stale-version"', 'Idempotency-Key' => $this->idemKey()]);

        $response->assertStatus(412);
        $response->assertJsonPath('code', 'STALE_VERSION');
    }

    public function test_double_submit_conflicts_with_409(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(2);

        $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => $version,
        ], ['Idempotency-Key' => $this->idemKey()])->assertOk();

        [$newVersion] = $this->weekVersion(2);

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => $newVersion,
        ], ['Idempotency-Key' => $this->idemKey()]);

        $response->assertConflict();
        $response->assertJsonPath('code', 'TRANSITION_CONFLICT');
    }

    public function test_submit_replays_identical_idempotent_retry(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(2);
        $key = $this->idemKey();

        $first = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => $version,
        ], ['Idempotency-Key' => $key]);
        $first->assertOk();

        $second = $this->portal('POST', '/api/v1/me/journal/weeks/2/submit', [
            'draft' => 'Final weekly report.',
            'version' => $version,
        ], ['Idempotency-Key' => $key]);
        $second->assertOk();
        $this->assertSame($first->json('version'), $second->json('version'));

        $week = Week::query()->where('placement_id', 'placement-a')->where('week_number', 2)->firstOrFail();
        $this->assertSame(1, Submission::query()->where('week_id', $week->id)->count());
    }

    public function test_submit_rejects_reused_key_with_different_payload_with_409(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(4);
        $key = $this->idemKey();

        $this->portal('POST', '/api/v1/me/journal/weeks/4/submit', [
            'draft' => 'Week four report.',
            'version' => $version,
        ], ['Idempotency-Key' => $key])->assertOk();

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/4/submit', [
            'draft' => 'A different report.',
            'version' => $version,
        ], ['Idempotency-Key' => $key]);

        $response->assertConflict();
        $response->assertJsonPath('code', 'VERSION_CONFLICT');
    }

    public function test_resubmit_after_changes_requested_reopens_company_review(): void
    {
        $this->be($this->user('student-1'));
        [$version] = $this->weekVersion(3);

        $week = Week::query()->where('placement_id', 'placement-a')->where('week_number', 3)->firstOrFail();
        $original = Submission::query()->where('week_id', $week->id)->firstOrFail();

        $response = $this->portal('POST', '/api/v1/me/journal/weeks/3/submit', [
            'draft' => 'Needs work, now with concrete examples.',
            'version' => $version,
        ], ['Idempotency-Key' => $this->idemKey()]);

        $response->assertOk();
        $response->assertJsonPath('status', 'submitted');
        $response->assertJsonPath('review.status', 'pending');

        // Immutable history: the original snapshot row is untouched, a new one is appended.
        $this->assertSame(2, Submission::query()->where('week_id', $week->id)->count());
        $this->assertSame('Needs work.', $original->refresh()->submitted_body);
    }
}
