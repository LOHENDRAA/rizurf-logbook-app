<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** AI organising: an intern's own projects, and on each journal day its project and reviewed suggestions. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('name_key', 120); // lower-cased and trimmed: names are unique per person ignoring case
            $table->string('description', 500)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'name_key']);
        });

        Schema::table('journal_entries', function (Blueprint $table) {
            // Deleting a project in use is refused by ProjectController; null-on-delete only keeps a user's cascade simple.
            $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
            $table->json('items')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('project_id');
            $table->dropColumn('items');
        });
        Schema::dropIfExists('projects');
    }
};
