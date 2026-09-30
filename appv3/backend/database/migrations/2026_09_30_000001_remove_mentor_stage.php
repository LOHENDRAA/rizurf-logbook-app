<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Supervisors are the only reviewers: drop the university-mentor stage.
     */
    public function up(): void
    {
        Schema::dropIfExists('mentor_assignments');

        Schema::table('weeks', function (Blueprint $table) {
            $table->dropColumn(['mentor_status', 'mentor_feedback', 'mentor_reviewed_by', 'mentor_reviewed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('weeks', function (Blueprint $table) {
            $table->string('mentor_status', 32)->nullable();
            $table->mediumText('mentor_feedback')->nullable();
            $table->string('mentor_reviewed_by')->nullable();
            $table->timestamp('mentor_reviewed_at')->nullable();
        });

        Schema::create('mentor_assignments', function (Blueprint $table) {
            $table->id();
            $table->string('mentor_id');
            $table->foreign('mentor_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('student_id');
            $table->foreign('student_id')->references('id')->on('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['mentor_id', 'student_id']);
            $table->index('student_id');
        });
    }
};
