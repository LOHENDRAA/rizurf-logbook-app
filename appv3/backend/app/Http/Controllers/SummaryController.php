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

    private const SYSTEM = "You write entries for a university internship logbook from an intern's own daily work notes.\n"
        ."Write ONE flowing paragraph in past tense that walks through the week in order, e.g.:\n"
        .'"Got the ERP gateway dev environment running and the test suite passing, then fixed a login redirect bug with a unit test to back it up. '
        .'Mid-week, picked up the invoice export ticket at sprint planning and built and Postman-tested the export endpoint. '
        ."Closed the week by reviewing a teammate's PR and updating the API docs.\"\n"
        ."Use only what the notes say — never invent tasks, tools, or results.\n"
        ."Fit the paragraph to the section title you're given. Plain text only: no bullet points, headings or markdown.";

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
