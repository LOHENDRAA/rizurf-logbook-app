<?php

namespace Tests\Feature;

use App\Models\Placement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Overview / My internship data: mode, profile, position and programme, journal details. */
class InternOverviewTest extends TestCase
{
    public function test_profile_carries_email_company_and_your_own_supervisors(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('GET', '/api/v1/me/logbook')->assertOk()
            ->assertJsonPath('profile.email', 'aisha.rahman@student.example.edu')
            ->assertJsonPath('profile.mode', 'logbook')
            ->assertJsonPath('profile.companyName', 'Nusantara Digital')
            ->assertJsonPath('profile.timeZone', 'Asia/Kuala_Lumpur')
            ->assertJsonPath('profile.position', 'Software Engineering Intern')
            ->assertJsonPath('profile.programme', 'BSc Computer Science')
            ->assertJsonPath('profile.supervisors', [['name' => 'Sarah Lim', 'email' => 'sarah.lim@nusantara.example.com']]);
    }

    public function test_profile_supervisors_are_only_from_your_company(): void
    {
        $this->be($this->user('student-2')); // Merlion has no supervisor in the seed

        $this->portal('GET', '/api/v1/me/logbook')->assertOk()->assertJsonPath('profile.supervisors', []);
    }

    public function test_an_intern_without_a_placement_still_gets_a_profile(): void
    {
        Placement::query()->where('student_id', 'student-1')->delete();
        $this->be($this->user('student-1'));

        $this->portal('GET', '/api/v1/me/logbook')->assertOk()
            ->assertJsonPath('profile.mode', null)
            ->assertJsonPath('profile.position', null)
            ->assertJsonPath('profile.timeZone', 'Asia/Kuala_Lumpur')
            ->assertJsonPath('profile.companyName', 'Nusantara Digital');
    }

    public function test_the_supervisor_view_of_an_intern_is_unchanged(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('GET', '/api/v1/supervisor/interns/student-1/logbook')->assertOk()->assertJsonMissingPath('profile');
    }

    public function test_switching_mode_keeps_everything(): void
    {
        $this->be($this->user('student-1'));
        $before = $this->portal('GET', '/api/v1/me/logbook')->json('weeks');

        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'journal'])->assertNoContent();
        $this->portal('GET', '/api/v1/me/logbook')->assertJsonPath('profile.mode', 'journal');
        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'logbook'])->assertNoContent();

        $this->portal('GET', '/api/v1/me/logbook')->assertJsonPath('profile.mode', 'logbook')->assertJsonPath('weeks', $before);
    }

    public function test_mode_is_for_interns_and_must_be_valid(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'diary'])->assertUnprocessable();

        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/me/mode', ['mode' => 'journal'])->assertForbidden();
    }

    public function test_first_setup_saves_position_and_programme(): void
    {
        $template = $this->template();
        Placement::query()->where('student_id', 'student-1')->delete();
        $this->be($this->user('student-1'));

        $this->portal('PUT', '/api/v1/me/internship', [
            'templateId' => $template->id, 'startDate' => '2026-09-21', 'endDate' => '2026-10-04', 'coverValues' => [],
            'position' => 'Data Intern', 'programmeName' => 'BSc Data Science',
        ])->assertOk();

        $this->portal('GET', '/api/v1/me/logbook')
            ->assertJsonPath('profile.position', 'Data Intern')
            ->assertJsonPath('profile.programme', 'BSc Data Science');
    }

    public function test_position_and_programme_save_after_a_submission(): void
    {
        $template = $this->template(); // student-1's university
        $this->be($this->user('student-1')); // the seed has student-1's week 1 submitted
        $logbook = $this->portal('GET', '/api/v1/me/logbook');
        $etag = (string) $logbook->headers->get('ETag');
        $s = $logbook->json('student');
        $body = ['templateId' => $template->id, 'startDate' => $s['startDate'], 'endDate' => $s['endDate'], 'coverValues' => []];

        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'position' => 'Platform Intern'], ['If-Match' => $etag])->assertOk();
        $this->portal('GET', '/api/v1/me/logbook')->assertJsonPath('profile.position', 'Platform Intern');

        $etag = (string) $this->portal('GET', '/api/v1/me/logbook')->headers->get('ETag');
        $this->portal('PUT', '/api/v1/me/internship', [...$body, 'endDate' => '2026-09-20'], ['If-Match' => $etag])
            ->assertConflict()->assertJsonPath('error.code', 'SETUP_LOCKED');
    }

    public function test_journal_details_round_trip(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('PUT', '/api/v1/journal', [
            'startDate' => '2026-08-03', 'university' => 'Sunway University', 'programme' => 'BSc IT', 'position' => 'QA Intern',
        ])->assertNoContent();

        $this->portal('GET', '/api/v1/journal')->assertOk()
            ->assertJsonPath('university', 'Sunway University')
            ->assertJsonPath('programme', 'BSc IT')
            ->assertJsonPath('position', 'QA Intern');
        $this->portal('PUT', '/api/v1/journal', ['startDate' => '2026-08-03', 'position' => str_repeat('a', 121)])->assertUnprocessable();
    }

    public function test_the_migration_marks_existing_journal_interns(): void
    {
        $migration = require database_path('migrations/2026_10_01_000002_add_intern_mode_and_details.php');
        Placement::query()->where('student_id', 'student-1')->delete();
        User::query()->whereKey('student-1')->update(['journal_start_date' => '2026-08-03', 'logbook_mode' => null]);
        User::query()->whereKey('student-2')->update(['journal_start_date' => '2026-08-03', 'logbook_mode' => null]); // has a placement

        $migration->markJournalInterns();

        $this->assertSame('journal', DB::table('users')->where('id', 'student-1')->value('logbook_mode'));
        $this->assertNull(DB::table('users')->where('id', 'student-2')->value('logbook_mode'));
    }
}
