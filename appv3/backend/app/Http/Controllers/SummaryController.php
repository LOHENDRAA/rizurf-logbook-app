<?php

namespace App\Http\Controllers;

use App\Support\Problem;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * AI summaries of a week's notes (roadmap step 5), for browsers without Chrome's free built-in AI.
 * The OpenAI key lives only in the server's .env, and nothing OpenAI says is passed back to the browser.
 */
final class SummaryController extends Controller
{
    private const URL = 'https://api.openai.com/v1/chat/completions';

    private const MODEL = 'gpt-4o-mini';

    private const SYSTEM = <<<'TXT'
        You write one section of a university internship logbook from an intern's own daily notes for one week.
        Match the style of this real APU logbook entry.

        Section "Type (s) & Objective(s) of the Activities":
        Developing and testing the attendance system micro-app (check-in/check-out interface and backend logic), and integrating it with the ERP gateway's shared authentication. Objective: to build a working attendance system that records check-in/check-out times and calculates working hours correctly.

        Section "Content: Please describe the technical and non-technical knowledge, skills, and experiences developed. Relate the relevance for future career.":
        This week I began development of the attendance system micro-app. I built the frontend check-in/check-out interface, and designed the backend database structure to store each attendance record along with the calculated working hours. I connected the micro-app to the gateway's shared login so employees would not need a separate account, and implemented logic to flag late check-ins and incomplete records for admin review. I then tested the system with sample attendance data, and fixed a few bugs, such as incorrect working-hour calculations across midnight and duplicate check-ins. Technically, I improved my skills in web application development, working with a database, and integrating with an internal authentication system. Non-technical skills developed include managing my time across several small tasks and asking senior developers for code review feedback. This hands-on, full-stack development experience is directly relevant to a future career in software engineering.

        Rules:
        - A section about type or objectives: one or two sentences naming the kind of work, then "Objective: to …".
        - A section about what was done, skills or career: one paragraph in the first person and past tense, starting "This week I", in the order things happened; only add the skills and career sentences when the section asks for them.
        - Any other section: answer what its title asks, in the same plain first-person style.
        - Use only what the notes say: never invent tasks, tools, or results.
        - Plain text only: no bullet points, headings, markdown, or commentary before or after.
        TXT;

    public function store(Request $request): JsonResponse
    {
        /** @var array<int, array{label: string, text: ?string}> $items */
        $items = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:10'],
            'items.*.label' => ['required', 'string', 'max:300'],
            'items.*.text' => ['present', 'nullable', 'string'],
        ])['items'];

        $key = (string) config('services.openai.key');
        if ($key === '') {
            Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', "AI summaries aren't set up on this server. Chrome 138+ on a desktop has free built-in summaries.");
        }

        // Only boxes with notes go to OpenAI, all at once, so a week with several boxes answers about as fast as one.
        $notes = array_filter(
            array_map(fn (array $item): string => mb_substr(trim((string) $item['text']), 0, 20000), $items),
            fn (string $text): bool => $text !== '',
        );
        $replies = $notes === [] ? [] : Http::pool(fn (Pool $pool) => array_map(
            fn (int $i) => $pool->as((string) $i)->withToken($key)->acceptJson()->timeout(50)->post(self::URL, [
                'model' => self::MODEL,
                'max_tokens' => 800,
                'messages' => [
                    ['role' => 'system', 'content' => self::SYSTEM],
                    ['role' => 'user', 'content' => "Logbook section: {$items[$i]['label']}\n\nThis week's notes:\n{$notes[$i]}"],
                ],
            ]),
            array_keys($notes),
        ));

        $summaries = [];
        foreach (array_keys($items) as $i) {
            if (! isset($notes[$i])) {
                $summaries[] = '';

                continue;
            }
            $reply = $replies[(string) $i] ?? null;
            $text = $reply instanceof ClientResponse && $reply->successful() ? $reply->json('choices.0.message.content') : null;
            if (! is_string($text)) {
                // OpenAI's own message can quote part of the key: log the status only, never pass it on.
                Log::warning('AI summary failed', ['status' => $reply instanceof ClientResponse ? $reply->status() : 'unreachable']);
                Problem::throw(Response::HTTP_SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', "The AI service didn't answer. Try again in a minute, or write the summary yourself.");
            }
            $summaries[] = trim($text);
        }

        return response()->json(['summaries' => $summaries]);
    }
}
