<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One day of someone's private journal (JournalController). */
class JournalEntry extends Model
{
    protected $fillable = ['user_id', 'date', 'body', 'project_id', 'items'];

    protected $casts = ['items' => 'array'];
}
