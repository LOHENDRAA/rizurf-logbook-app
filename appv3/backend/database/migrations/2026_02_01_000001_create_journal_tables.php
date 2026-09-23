<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Journal tables: versioned weeks, daily entries, immutable submission
     * history, immutable review actions, and idempotency records.
     */
    public function up(): void
    {
        Schema::create('weeks', function (Blueprint $table) {
            $table->id();
            $table->string('placement_id');
            $table->foreign('placement_id')->references('id')->on('placements')->cascadeOnDelete();
            $table->unsignedInteger('week_number');
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status', 32)->default('not_started')->index();
            $table->string('version', 64);
            $table->mediumText('weekly_draft')->default('');
            $table->timestamp('weekly_draft_updated_at')->nullable();
            $table->mediumText('submitted_body')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->string('company_status', 32)->nullable();
            $table->mediumText('company_feedback')->nullable();
            $table->string('company_reviewed_by')->nullable();
            $table->timestamp('company_reviewed_at')->nullable();
            $table->string('mentor_status', 32)->nullable();
            $table->mediumText('mentor_feedback')->nullable();
            $table->string('mentor_reviewed_by')->nullable();
            $table->timestamp('mentor_reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['placement_id', 'week_number']);
        });

        Schema::create('daily_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('week_id')->constrained('weeks')->cascadeOnDelete();
            $table->date('date');
            $table->mediumText('body')->default('');
            $table->timestamps();
            $table->unique(['week_id', 'date']);
        });

        Schema::create('submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('week_id')->constrained('weeks')->cascadeOnDelete();
            $table->mediumText('submitted_body');
            $table->string('version', 64);
            $table->string('submitted_by');
            $table->timestamp('created_at')->nullable()->index();
        });

        Schema::create('review_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('week_id')->constrained('weeks')->cascadeOnDelete();
            $table->string('stage', 16);
            $table->string('decision', 32);
            $table->mediumText('feedback')->nullable();
            $table->string('reviewer_id');
            $table->timestamp('created_at')->nullable()->index();
            $table->index(['week_id', 'stage']);
        });

        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 128);
            $table->string('key', 128);
            $table->string('request_hash', 64);
            $table->unsignedSmallInteger('response_status');
            $table->longText('response_body')->nullable();
            $table->string('response_etag', 128)->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamp('created_at')->nullable();
            $table->unique(['scope', 'key']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('review_actions');
        Schema::dropIfExists('submissions');
        Schema::dropIfExists('daily_entries');
        Schema::dropIfExists('weeks');
    }
};
