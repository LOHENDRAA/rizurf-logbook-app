<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public const ROLE_STUDENT = 'student';

    public const ROLE_SUPERVISOR = 'supervisor';

    public const ROLE_MENTOR = 'university_mentor';

    public const ROLES = [self::ROLE_STUDENT, self::ROLE_SUPERVISOR, self::ROLE_MENTOR];

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'email',
        'password',
        'role',
        'avatar',
        'company_id',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isStudent(): bool
    {
        return $this->role === self::ROLE_STUDENT;
    }

    public function isSupervisor(): bool
    {
        return $this->role === self::ROLE_SUPERVISOR;
    }

    public function isMentor(): bool
    {
        return $this->role === self::ROLE_MENTOR;
    }

    /**
     * @return BelongsTo<Company, $this>
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * @return HasOne<Placement, $this>
     */
    public function placement(): HasOne
    {
        return $this->hasOne(Placement::class, 'student_id', 'id');
    }

    /**
     * @return HasMany<MentorAssignment, $this>
     */
    public function mentorAssignments(): HasMany
    {
        return $this->hasMany(MentorAssignment::class, 'mentor_id', 'id');
    }
}
