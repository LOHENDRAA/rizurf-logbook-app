<?php

namespace App\Policies;

use App\Models\MentorAssignment;
use App\Models\User;
use App\Models\Week;

/**
 * Scope enforcement order: role first (403), then resource scope (403),
 * then existence (404). Scope failures never leak whether the resource
 * exists.
 */
final class WeekPolicy
{
    public function viewAsStudent(User $user, Week $week): bool
    {
        return $user->isStudent()
            && $week->placement !== null
            && $week->placement->student_id === $user->id;
    }

    public function mutateAsStudent(User $user, Week $week): bool
    {
        return $this->viewAsStudent($user, $week);
    }

    public function viewAsSupervisor(User $user, Week $week): bool
    {
        return $user->isSupervisor()
            && $user->company_id !== null
            && $week->placement !== null
            && $week->placement->company_id === $user->company_id;
    }

    public function reviewAsSupervisor(User $user, Week $week): bool
    {
        return $this->viewAsSupervisor($user, $week);
    }

    public function viewAsMentor(User $user, Week $week): bool
    {
        if (! $user->isMentor() || $week->placement === null) {
            return false;
        }

        return MentorAssignment::query()
            ->where('mentor_id', $user->id)
            ->where('student_id', $week->placement->student_id)
            ->exists();
    }

    public function reviewAsMentor(User $user, Week $week): bool
    {
        return $this->viewAsMentor($user, $week);
    }
}
