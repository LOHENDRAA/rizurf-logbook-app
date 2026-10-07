<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The private journal: TestCase pins "today" to 2026-09-21 12:00 in Kuala Lumpur. */
class PersonalJournalTest extends TestCase
{
    public function test_you_can_write_and_read_your_own_journal(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the new interns.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/2026-09-18', ['text' => 'Planned the sprint.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the new interns twice.'])->assertNoContent();

        $this->portal('GET', '/api/v1/journal')->assertOk()->assertExactJson([
            'startDate' => null, 'university' => null, 'programme' => null, 'position' => null,
            'entries' => [
                ['date' => '2026-09-18', 'text' => 'Planned the sprint.'],
                ['date' => '2026-09-21', 'text' => 'Met the new interns twice.'],
            ],
        ]);
    }

    public function test_nobody_else_can_read_it(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Private thoughts.'])->assertNoContent();

        foreach (['supervisor-1', 'student-3', 'student-2'] as $other) {
            $this->be($this->user($other));
            $this->portal('GET', '/api/v1/journal')->assertOk()->assertExactJson(['startDate' => null, 'university' => null, 'programme' => null, 'position' => null, 'entries' => []]);
        }

        // The supervisor's view of this intern's logbook doesn't carry the journal either.
        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()->assertDontSee('Private thoughts.');
    }

    public function test_a_future_or_impossible_day_is_refused(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-22', ['text' => 'Tomorrow.'])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/2026-02-30', ['text' => 'Not a day.'])->assertUnprocessable();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries', []);
    }

    public function test_today_is_malaysian_today(): void
    {
        // 00:30 on the 22nd in Kuala Lumpur is still the 21st in UTC.
        $this->travelTo(Carbon::parse('2026-09-22 00:30:00', 'Asia/Kuala_Lumpur'));
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-22', ['text' => 'Early start.'])->assertNoContent();
    }

    public function test_empty_text_deletes_the_day(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Draft.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => '   '])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries', []);
    }

    public function test_text_over_20000_characters_is_refused(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => str_repeat('a', 20001)])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => str_repeat('a', 20000)])->assertNoContent();
    }

    public function test_setting_the_start_date(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal', ['startDate' => '2026-08-03'])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('startDate', '2026-08-03');
        $this->portal('PUT', '/api/v1/journal', ['startDate' => 'soon'])->assertUnprocessable();
    }

    public function test_you_must_be_signed_in(): void
    {
        $this->portal('GET', '/api/v1/journal')->assertUnauthorized();
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'x'])->assertUnauthorized();
        $this->portal('PUT', '/api/v1/journal', ['startDate' => '2026-08-03'])->assertUnauthorized();
    }

    public function test_week_notes_are_gone_and_supervisors_never_receive_entries(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Private thoughts.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/me/journal/weeks/1/daily', ['date' => '2026-09-21', 'body' => 'x'])->assertNotFound();
        $this->portal('GET', '/api/v1/me/logbook')->assertOk()->assertJsonMissingPath('weeks.0.dailyEntries');

        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()
            ->assertJsonMissingPath('weeks.0.dailyEntries')
            ->assertDontSee('Private thoughts.');
    }

    public function test_supervisors_get_submitted_answers_only_and_never_the_journal_copy(): void
    {
        // The intern's builder autofills from the private journal: the raw copy sits in `autofilled`, and in a draft's answers.
        DB::table('weeks')->where('placement_id', 'placement-a')->update(['autofilled' => json_encode(['mon' => 'Private journal text.'])]);

        $this->be($this->user('supervisor-1'));
        $weeks = $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()
            ->assertDontSee('Private journal text.')
            ->assertDontSee('In-progress draft.')
            ->json('weeks');
        $byNumber = collect($weeks)->keyBy('weekNumber');
        $this->assertSame(['summary' => 'Seeded weekly report.'], $byNumber[1]['values']); // submitted: the supervisor sees it
        $this->assertSame([], $byNumber[2]['values']); // never submitted: nothing
        $this->assertSame([], $byNumber[1]['autofilled']);
        $this->portal('GET', '/api/v1/supervisor/interns/student-1/weeks/2')->assertOk()->assertDontSee('In-progress draft.')->assertDontSee('Private journal text.');

        // The intern still sees all of their own.
        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/me/logbook')->assertSee('In-progress draft.')->assertSee('Private journal text.');
    }
}
