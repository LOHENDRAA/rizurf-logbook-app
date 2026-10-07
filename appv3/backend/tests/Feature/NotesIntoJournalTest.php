<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Old Notepad notes move into their intern's private journal; same-day texts are joined, journal first. */
class NotesIntoJournalTest extends TestCase
{
    public function test_notes_move_into_the_journal_and_the_table_goes(): void
    {
        $migration = require database_path('migrations/2026_10_07_000001_notes_move_into_the_journal.php');
        $migration->down(); // the table as it was, empty

        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-16', ['text' => 'Journal first.'])->assertNoContent();
        $week = DB::table('weeks')->join('placements', 'placements.id', '=', 'weeks.placement_id')
            ->where('placements.student_id', 'student-1')->value('weeks.id');
        $this->assertNotNull($week, 'student-1 needs a placement with weeks in the test seed');
        DB::table('daily_entries')->insert([
            ['week_id' => $week, 'date' => '2026-09-15', 'body' => 'Only a note.', 'created_at' => now(), 'updated_at' => now()],
            ['week_id' => $week, 'date' => '2026-09-16', 'body' => 'Then the note.', 'created_at' => now(), 'updated_at' => now()],
            ['week_id' => $week, 'date' => '2026-09-17', 'body' => "  \n ", 'created_at' => now(), 'updated_at' => now()],
        ]);

        $migration->up();

        $this->assertFalse(Schema::hasTable('daily_entries'));
        $this->portal('GET', '/api/v1/journal')->assertOk()->assertJsonPath('entries', [
            ['date' => '2026-09-15', 'text' => 'Only a note.'],
            ['date' => '2026-09-16', 'text' => "Journal first.\n\nThen the note."],
        ]);
    }
}
