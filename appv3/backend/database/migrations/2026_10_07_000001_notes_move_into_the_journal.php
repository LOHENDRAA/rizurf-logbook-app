<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** One private set of entries per person: the old Notepad notes join each intern's journal. Back up before running. */
return new class extends Migration
{
    public function up(): void
    {
        $this->copyNotes();
        Schema::dropIfExists('daily_entries');
    }

    /** Same day in both: the journal text, a blank line, then the note. Blank notes are skipped. */
    public function copyNotes(): void
    {
        $notes = DB::table('daily_entries')
            ->join('weeks', 'weeks.id', '=', 'daily_entries.week_id')
            ->join('placements', 'placements.id', '=', 'weeks.placement_id')
            ->select('placements.student_id as user_id', 'daily_entries.date', 'daily_entries.body')
            ->orderBy('daily_entries.date')
            ->get();

        foreach ($notes as $note) {
            $body = trim((string) $note->body);
            if ($body === '') {
                continue;
            }
            $key = ['user_id' => $note->user_id, 'date' => substr((string) $note->date, 0, 10)];
            $existing = DB::table('journal_entries')->where($key)->value('body');
            if ($existing === null) {
                DB::table('journal_entries')->insert([...$key, 'body' => $body, 'created_at' => now(), 'updated_at' => now()]);
            } else {
                DB::table('journal_entries')->where($key)->update(['body' => rtrim((string) $existing)."\n\n".$body, 'updated_at' => now()]);
            }
        }
    }

    /** The table comes back empty; the notes stay in the journal. */
    public function down(): void
    {
        Schema::create('daily_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('week_id')->constrained('weeks')->cascadeOnDelete();
            $table->date('date');
            $table->mediumText('body')->default('');
            $table->timestamps();
            $table->unique(['week_id', 'date']);
        });
    }
};
