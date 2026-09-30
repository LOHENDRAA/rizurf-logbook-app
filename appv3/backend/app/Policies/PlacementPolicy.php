<?php

namespace App\Policies;

use App\Models\Placement;
use App\Models\User;

final class PlacementPolicy
{
    public function viewAsStudent(User $user, Placement $placement): bool
    {
        return $user->isStudent() && $placement->student_id === $user->id;
    }

    public function viewInternAsSupervisor(User $user, Placement $placement): bool
    {
        return $user->isSupervisor()
            && $user->company_id !== null
            && $placement->company_id === $user->company_id;
    }
}
