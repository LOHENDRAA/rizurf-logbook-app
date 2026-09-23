<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Portal identity tables: string-keyed users (fixture-stable ids),
     * companies, placements, and mentor assignments.
     */
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('role', 32)->index();
            $table->string('avatar', 16)->nullable();
            $table->string('company_id')->nullable();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('placements', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('student_id')->unique();
            $table->foreign('student_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('company_id');
            $table->foreign('company_id')->references('id')->on('companies')->restrictOnDelete();
            $table->string('university_name');
            $table->string('programme_name');
            $table->string('programme_timezone', 64);
            $table->string('position');
            $table->date('start_date');
            $table->date('end_date');
            $table->timestamps();
            $table->index('company_id');
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

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('mentor_assignments');
        Schema::dropIfExists('placements');
        Schema::dropIfExists('users');
        Schema::dropIfExists('companies');
    }
};
