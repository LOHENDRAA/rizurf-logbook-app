<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** The private journal: one row per person per day, and the day its Week 1 starts. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->date('date');
            $table->mediumText('body');
            $table->timestamps();
            $table->unique(['user_id', 'date']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->date('journal_start_date')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('journal_start_date');
        });
        Schema::dropIfExists('journal_entries');
    }
};
