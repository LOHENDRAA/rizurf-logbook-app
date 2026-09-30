<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One university logbook template (Word or PDF) per university, with the
     * placeholder overlay the supervisor corrected in the browser.
     */
    public function up(): void
    {
        Schema::create('logbook_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('university_name', 200);
            $table->string('university_key', 200)->unique();
            $table->string('format', 8);
            $table->string('file_name');
            $table->string('file_path');
            $table->json('placeholders');
            $table->json('page_roles')->nullable();
            $table->unsignedInteger('unit_start_block')->nullable();
            $table->string('version', 64);
            $table->string('created_by');
            $table->foreign('created_by')->references('id')->on('users');
            $table->string('updated_by');
            $table->foreign('updated_by')->references('id')->on('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('logbook_templates');
    }
};
