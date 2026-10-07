<?php

namespace App\Http\Controllers;

use App\Models\JournalEntry;
use App\Models\Project;
use App\Support\Problem;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * AI organising of an intern's own journal days. The browser merges suggestions with what was already
 * reviewed (src/core/organize.ts) and saves the result here; this class stores it and checks it.
 */
final class OrganizeController extends Controller
{
    private const URL = 'https://api.openai.com/v1/chat/completions';

    private const MODEL = 'gpt-4o-mini';

    private const FAILED = "Your entry is saved. I couldn't organize it right now. Try again";

    private const SYSTEM = <<<'TXT'
        You organize one day of an intern's private work journal.
        Reply with JSON only, exactly this shape:
        {"project": string or null, "activities": [string], "learning": [string], "skills": [string]}

        Rules:
        - Use only what the entry states. Never invent tasks, tools, results or skills.
        - activities: 1 to 4 things the intern did, as short past-tense phrases ("Built the login page").
        - learning: 0 to 3 things the intern learned, as short phrases.
        - skills: 0 to 3 short skill names the entry clearly shows ("Data modelling", "Unit testing").
        - project: the work this entry belongs to. Prefer one of the existing projects when it fits, spelled exactly as listed; otherwise a short new name (2 to 4 words); null if the entry names no work.
        TXT;

    public function organize(Request $request, string $date): JsonResponse
    {
        $user = ProjectController::intern($request);
        $entry = JournalEntry::query()->where('user_id', $user->id)->where('date', $date)->firstOrFail();
        $key = (string) config('services.openai.key');
        if ($key === '') {
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', self::FAILED);
        }

        $names = array_column(Project::listFor($user->id), 'name');
        try {
            $reply = Http::withToken($key)->acceptJson()->timeout(50)->post(self::URL, [
                'model' => self::MODEL,
                'max_tokens' => 600,
                'response_format' => ['type' => 'json_object'],
                'messages' => [
                    ['role' => 'system', 'content' => self::SYSTEM],
                    ['role' => 'user', 'content' => 'Existing projects: '.($names === [] ? 'none' : implode('; ', $names))
                        ."\n\nEntry:\n".mb_substr((string) $entry->body, 0, 20000)],
                ],
            ]);
        } catch (ConnectionException) {
            $reply = null;
        }

        $content = $reply?->successful() ? $reply->json('choices.0.message.content') : null;
        $json = is_string($content) ? json_decode($content, true) : null;
        $out = is_array($json) ? $this->shape($json) : null;
        if ($out === null) {
            // OpenAI's own message can quote part of the key: log the status only, never pass it on.
            Log::warning('AI organize failed', ['status' => $reply?->status() ?? 'unreachable']);
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', self::FAILED);
        }

        return response()->json($out);
    }

    /**
     * OpenAI's JSON cut to the spec's limits, or null when it isn't the agreed shape.
     *
     * @param  array<mixed>  $json
     * @return array{project: ?string, activities: list<string>, learning: list<string>, skills: list<string>}|null
     */
    private function shape(array $json): ?array
    {
        $list = function (mixed $value, int $max): ?array {
            if (! is_array($value) || ! array_is_list($value)) {
                return null;
            }
            $out = [];
            foreach ($value as $text) {
                if (! is_string($text)) {
                    return null;
                }
                $text = mb_substr(trim($text), 0, 300);
                if ($text !== '') {
                    $out[] = $text;
                }
            }

            return array_slice($out, 0, $max);
        };
        $project = $json['project'] ?? null;
        if (array_is_list($json) || ($project !== null && ! is_string($project))) {
            return null;
        }
        $activities = $list($json['activities'] ?? null, 4);
        $learning = $list($json['learning'] ?? [], 3);
        $skills = $list($json['skills'] ?? [], 3);
        if ($activities === null || $learning === null || $skills === null) {
            return null;
        }
        $project = $project === null ? '' : mb_substr(trim($project), 0, 120);

        return ['project' => $project === '' ? null : $project, 'activities' => $activities, 'learning' => $learning, 'skills' => $skills];
    }

    public function save(Request $request, string $date): JsonResponse
    {
        $user = ProjectController::intern($request);
        $entry = JournalEntry::query()->where('user_id', $user->id)->where('date', $date)->firstOrFail();
        /** @var array{projectId?: ?string, newProjectName?: ?string, items: list<array<string, string>>} $data */
        $data = $request->validate([
            'projectId' => ['sometimes', 'nullable', 'string'],
            'newProjectName' => ['sometimes', 'nullable', 'string', 'max:120'],
            'items' => ['present', 'array', 'max:40'],
            'items.*.id' => ['required', 'string', 'max:64'],
            'items.*.kind' => ['required', 'in:project,activity,learning,skill'],
            'items.*.text' => ['required', 'string', 'max:300'],
            'items.*.status' => ['required', 'in:suggested,accepted,rejected'],
        ]);

        $name = trim((string) ($data['newProjectName'] ?? ''));
        $projectId = null;
        if ($name !== '') {
            $projectId = Project::query()->firstOrCreate(
                ['user_id' => $user->id, 'name_key' => Project::keyOf($name)],
                ['name' => $name],
            )->id;
        } elseif (($data['projectId'] ?? null) !== null) {
            $project = Project::query()->where('user_id', $user->id)->find($data['projectId']);
            if ($project === null) {
                throw ValidationException::withMessages(['projectId' => "That project isn't one of yours."]);
            }
            $projectId = $project->id;
        }

        $items = array_map(fn (array $i): array => Arr::only($i, ['id', 'kind', 'text', 'status']), $data['items']);
        $entry->forceFill(['project_id' => $projectId, 'items' => $items])->save();

        return response()->json([
            'projectId' => $projectId === null ? null : (string) $projectId,
            'items' => $items,
            'projects' => Project::listFor($user->id),
        ]);
    }
}
