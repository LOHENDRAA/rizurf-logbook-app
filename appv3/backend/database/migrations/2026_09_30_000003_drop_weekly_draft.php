<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A week's content is now its template answers (weeks.answers), not free draft text.
     */
    public function up(): void
    {
        Schema::table('weeks', function (Blueprint $table) {
            $table->dropColumn(['weekly_draft', 'weekly_draft_updated_at']);
        });
    }

    public function down(): void
    {
        Schema::table('weeks', function (Blueprint $table) {
            $table->mediumText('weekly_draft')->nullable();
            $table->timestamp('weekly_draft_updated_at')->nullable();
        });
    }
};
