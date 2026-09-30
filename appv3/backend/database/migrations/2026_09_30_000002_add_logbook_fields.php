<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What the logbook screens keep: cover answers per intern, answers per week
     * (tagged with the template they were written for), and the approver's signature.
     */
    public function up(): void
    {
        Schema::table('placements', function (Blueprint $table) {
            $table->json('cover_values')->nullable();
            $table->string('version', 64)->default('p-1');
        });

        Schema::table('weeks', function (Blueprint $table) {
            $table->uuid('template_id')->nullable();
            $table->json('answers')->nullable();
            $table->json('autofilled')->nullable();
        });

        Schema::table('review_actions', function (Blueprint $table) {
            $table->string('signature')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('review_actions', fn (Blueprint $table) => $table->dropColumn('signature'));
        Schema::table('weeks', fn (Blueprint $table) => $table->dropColumn(['template_id', 'answers', 'autofilled']));
        Schema::table('placements', fn (Blueprint $table) => $table->dropColumn(['cover_values', 'version']));
    }
};
