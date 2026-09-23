<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['id', 'name'];

    /**
     * @return HasMany<User, $this>
     */
    public function supervisors(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * @return HasMany<Placement, $this>
     */
    public function placements(): HasMany
    {
        return $this->hasMany(Placement::class);
    }
}
