<?php

namespace App\Http\Controllers;

use App\Http\Resources\PortalResources;
use App\Models\Placement;
use App\Services\CapabilityService;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

final class MeController extends Controller
{
    public function __construct(private readonly CapabilityService $capabilities) {}

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(
            PortalResources::sessionUser($user, $this->capabilities->forSession($user))
        );
    }

    public function internship(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->isStudent()) {
            Problem::throw(
                Response::HTTP_FORBIDDEN,
                'FORBIDDEN',
                'Only students have placements.'
            );
        }

        $placement = Placement::query()
            ->with(['company', 'student'])
            ->where('student_id', $user->id)
            ->first();

        if ($placement === null) {
            Problem::throw(
                Response::HTTP_NOT_FOUND,
                'RESOURCE_NOT_FOUND',
                'No placement found for this student.'
            );
        }

        return response()->json(PortalResources::internship($placement));
    }

    public function mode(Request $request): HttpResponse
    {
        $user = $request->user();

        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns choose between a logbook and a journal.');
        }

        $mode = $request->validate(['mode' => ['required', Rule::in(['logbook', 'journal'])]])['mode'];
        $user->forceFill(['logbook_mode' => $mode])->save();

        return response()->noContent();
    }
}
