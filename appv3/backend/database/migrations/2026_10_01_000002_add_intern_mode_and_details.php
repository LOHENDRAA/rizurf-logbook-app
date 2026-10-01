<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Interns choose a logbook or a journal (switchable); journal interns keep their own university, programme and position. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('logbook_mode', 16)->nullable();
            $table->string('journal_university', 120)->nullable();
            $table->string('journal_programme', 120)->nullable();
            $table->string('journal_position', 120)->nullable();
        });
        $this->markJournalInterns();
    }

    /** Interns who already keep a journal and have no placement were journal-only before the mode existed. */
    public function markJournalInterns(): void
    {
        DB::table('users')
            ->whereNull('logbook_mode')
            ->whereNotNull('journal_start_date')
            ->whereNotIn('id', DB::table('placements')->select('student_id'))
            ->update(['logbook_mode' => 'journal']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['logbook_mode', 'journal_university', 'journal_programme', 'journal_position']);
        });
    }
};
