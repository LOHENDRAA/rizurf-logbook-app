<?php

namespace App\Http\Controllers;

use App\Models\JournalEntry;
use App\Models\Project;
use App\Models\User;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/** An intern's own projects. Someone else's project is simply not found. */
final class ProjectController extends Controller
{
    /** Projects and organizing are for interns; supervisors keep a plain journal. */
    public static function intern(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        if (! $user->isStudent()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only interns organize their journal into projects.');
        }

        return $user;
    }

    public function store(Request $request): JsonResponse
    {
        $user = self::intern($request);
        $data = $this->valid($request, $user, null);
        $project = Project::query()->create([
            'user_id' => $user->id,
            'name' => $data['name'],
            'name_key' => Project::keyOf($data['name']),
            'description' => $data['description'] ?? null,
        ]);

        return response()->json($project->toApi(), Response::HTTP_CREATED);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = self::intern($request);
        $project = Project::query()->where('user_id', $user->id)->findOrFail($id);
        $data = $this->valid($request, $user, $project);
        $project->update([
            'name' => $data['name'],
            'name_key' => Project::keyOf($data['name']),
            'description' => array_key_exists('description', $data) ? $data['description'] : $project->description,
        ]);

        return response()->json($project->toApi());
    }

    public function destroy(Request $request, string $id): Response
    {
        $user = self::intern($request);
        $project = Project::query()->where('user_id', $user->id)->findOrFail($id);
        if (JournalEntry::query()->where('project_id', $project->id)->exists()) {
            Problem::throw(Response::HTTP_CONFLICT, 'CONFLICT', 'Entries still use this project. Move them first.');
        }
        $project->delete();

        return response()->noContent();
    }

    /** @return array{name: string, description?: ?string} */
    private function valid(Request $request, User $user, ?Project $self): array
    {
        /** @var array{name: string, description?: ?string} $data */
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);
        $data['name'] = trim($data['name']);
        $taken = Project::query()->where('user_id', $user->id)->where('name_key', Project::keyOf($data['name']))
            ->when($self !== null, fn ($q) => $q->whereKeyNot($self?->id))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['name' => "You already have a project called {$data['name']}."]);
        }

        return $data;
    }
}
