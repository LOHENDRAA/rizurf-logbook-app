<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** An intern's private weekly reflection: one per intern per week (keyed by the week's Monday). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reflections', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->date('week_start');
            $table->text('text');
            $table->timestamps();
            $table->unique(['user_id', 'week_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reflections');
    }
};
