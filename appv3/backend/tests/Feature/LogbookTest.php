<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\WeekService;
use Tests\TestCase;

class LogbookTest extends TestCase
{
    private function newIntern(?string $companyId = 'company-nusantara'): User
    {
        $intern = User::factory()->student()->create(['company_id' => $companyId]);
        $this->be($intern);

        return $intern;
    }

    /**
     * @param  array<string, string>  $cover
     * @return array<string, mixed>
     */
    private function setupBody(string $templateId, string $start, string $end, array $cover = []): array
    {
        return ['templateId' => $templateId, 'startDate' => $start, 'endDate' => $end, 'coverValues' => $cover];
    }

    public function test_weeks_run_monday_to_sunday(): void
    {
        $this->assertSame([
            ['week_number' => 1, 'start_date' => '2026-09-23', 'end_date' => '2026-09-27'],
            ['week_number' => 2, 'start_date' => '2026-09-28', 'end_date' => '2026-10-04'],
            ['week_number' => 3, 'start_date' => '2026-10-05', 'end_date' => '2026-10-06'],
        ], app(WeekService::class)->buildWeeks('2026-09-23', '2026-10-06'));
    }

    public function test_an_intern_without_a_placement_gets_an_empty_logbook(): void
    {
        $intern = $this->newIntern();

        $this->portal('GET', '/api/v1/me/logbook')
            ->assertOk()
            ->assertJsonPath('student.id', $intern->id)
            ->assertJsonPath('student.name', $intern->name)
            ->assertJsonPath('student.templateId', null)
            ->assertJsonPath('student.startDate', null)
            ->assertJsonPath('student.canChangeSetup', true)
            ->assertJsonPath('weeks', []);
    }

    public function test_only_interns_have_a_logbook(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/me/logbook')->assertForbidden()->assertJsonPath('error.code', 'FORBIDDEN');
    }

    public function test_an_intern_sets_up_their_internship(): void
    {
        $template = $this->template("Taylor's University");
        $intern = $this->newIntern();

        $response = $this->portal('PUT', '/api/v1/me/internship',
            $this->setupBody($template->id, '2026-09-23', '2026-10-06', ['ph-name' => 'Nur Aina']));

        $response->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('student.templateId', $template->id)
            ->assertJsonPath('student.coverValues', ['ph-name' => 'Nur Aina'])
            ->assertJsonPath('weeks.0.periodKey', 'w:2026-09-21')
            ->assertJsonPath('weeks.0.startDate', '2026-09-23')
            ->assertJsonPath('weeks.0.fillStatus', 'draft')
            ->assertJsonPath('weeks.2.endDate', '2026-10-06');
        $this->assertCount(3, $response->json('weeks'));
        $this->assertDatabaseHas('placements', [
            'student_id' => $intern->id,
            'company_id' => 'company-nusantara',
            'university_name' => "Taylor's University",
        ]);
    }

    public function test_setup_needs_a_company_on_the_account(): void
    {
        $template = $this->template();
        $this->newIntern(null);

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-09-23', '2026-10-06'))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'NO_COMPANY');
    }

    public function test_setup_rejects_an_internship_longer_than_a_year(): void
    {
        $template = $this->template();
        $this->newIntern();

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-01-01', '2027-01-03'))
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'VALIDATION_ERROR');
    }

    public function test_changing_an_existing_setup_needs_a_current_if_match(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $body = $this->setupBody($template->id, '2026-08-03', '2026-09-27');

        $this->portal('PUT', '/api/v1/me/internship', $body)->assertStatus(428);
        $this->portal('PUT', '/api/v1/me/internship', $body, ['If-Match' => '"stale"'])
            ->assertStatus(412)
            ->assertJsonPath('error.code', 'STALE_VERSION');
    }

    public function test_university_and_dates_lock_after_a_submission_but_cover_answers_do_not(): void
    {
        $template = $this->template();
        $this->be($this->user('student-1'));
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')
            ->assertJsonPath('student.canChangeSetup', false)
            ->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-08-03', '2026-09-20'), ['If-Match' => $etag])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'SETUP_LOCKED');

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-08-03', '2026-09-27', ['ph-name' => 'Aisha']), ['If-Match' => $etag])
            ->assertOk()
            ->assertJsonPath('student.coverValues', ['ph-name' => 'Aisha']);
    }

    public function test_changing_dates_keeps_notes_and_refuses_to_drop_them(): void
    {
        $template = $this->template("Taylor's University");
        $this->newIntern();
        $body = $this->setupBody($template->id, '2026-09-14', '2026-09-30');

        $this->portal('PUT', '/api/v1/me/internship', $body)->assertOk();
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-09-15', 'body' => 'Set up my laptop.'])->assertOk();
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-16'], ['If-Match' => $etag])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'SETUP_DROPS_WORK');

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-15'], ['If-Match' => $etag])
            ->assertOk()
            ->assertJsonPath('weeks.0.startDate', '2026-09-15')
            ->assertJsonPath('weeks.0.dailyEntries.0.body', 'Set up my laptop.');
    }

    public function test_a_cleared_note_does_not_block_a_date_change(): void
    {
        $template = $this->template("Taylor's University");
        $this->newIntern();
        $body = $this->setupBody($template->id, '2026-09-14', '2026-09-30');

        $this->portal('PUT', '/api/v1/me/internship', $body)->assertOk();
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-09-15', 'body' => 'Set up my laptop.'])->assertOk();
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-09-15', 'body' => ''])
            ->assertOk()
            ->assertJsonPath('body', '');
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-16'], ['If-Match' => $etag])->assertOk();
    }

    public function test_a_recut_week_never_reuses_an_old_etag(): void
    {
        $template = $this->template("Taylor's University");
        $this->newIntern();
        $body = $this->setupBody($template->id, '2026-09-14', '2026-09-30');
        $setup = $this->portal('PUT', '/api/v1/me/internship', $body)->assertOk();
        $oldWeekOne = (string) $this->portal('GET', '/api/v1/me/journal/weeks/1')->headers->get('ETag');

        // Starting a week earlier turns the old week 1 into week 2 and creates a new week 1.
        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'startDate' => '2026-09-07'], [
            'If-Match' => (string) $setup->headers->get('ETag'),
        ])->assertOk()->assertJsonPath('weeks.0.startDate', '2026-09-07');

        $this->portal('PUT', '/api/v1/me/journal/weeks/1/values', [
            'templateId' => $template->id,
            'values' => ['summary' => 'Written for the week of the 14th.'],
            'autofilled' => [],
        ], ['If-Match' => $oldWeekOne])->assertStatus(412)->assertJsonPath('error.code', 'STALE_VERSION');
    }

    public function test_a_date_change_never_deletes_a_week_that_was_submitted(): void
    {
        $template = $this->template("Taylor's University");
        $intern = $this->newIntern();
        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($template->id, '2026-09-14', '2026-09-30'))->assertOk();

        $etag = (string) $this->portal('GET', '/api/v1/me/journal/weeks/1')->headers->get('ETag');
        $version = $this->portal('PUT', '/api/v1/me/journal/weeks/1/values', [
            'templateId' => $template->id, 'values' => ['summary' => 'Week one.'], 'autofilled' => [],
        ], ['If-Match' => $etag])->assertOk()->json('version');
        $this->portal('POST', '/api/v1/me/journal/weeks/1/submit', ['version' => $version], ['Idempotency-Key' => $this->idemKey()])->assertOk();

        $this->be($this->user('supervisor-1'));
        $this->portal('POST', "/api/v1/supervisor/interns/{$intern->id}/weeks/1/review", [
            'decision' => 'request_changes', 'feedback' => 'Redo it.',
        ], ['Idempotency-Key' => $this->idemKey()])->assertOk();

        // The intern blanks the week, then their template disappears, which unlocks the dates.
        $this->be($intern);
        $etag = (string) $this->portal('GET', '/api/v1/me/journal/weeks/1')->headers->get('ETag');
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/values', [
            'templateId' => $template->id, 'values' => ['summary' => ''], 'autofilled' => [],
        ], ['If-Match' => $etag])->assertOk();
        $template->delete();
        $other = $this->template('Other University');
        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');

        $this->portal('PUT', '/api/v1/me/internship', $this->setupBody($other->id, '2026-09-21', '2026-09-30'), ['If-Match' => $etag])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'SETUP_DROPS_WORK');
    }
}
