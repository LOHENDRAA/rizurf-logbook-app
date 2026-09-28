<?php
// POST {"items":[{"label":"...","text":"..."}]} -> {"summaries":["...", ...]}
// Summarizes an intern's week of notes for each logbook answer box with OpenAI (gpt-4o-mini).
// Used only when the browser has no free built-in AI. The key stays on the server:
// set OPENAI_API_KEY, or copy config.example.php to config.php.
// ponytail: no auth/rate limit — fine on a local XAMPP prototype; the Laravel gateway must add both.
declare(strict_types=1);

header('Content-Type: application/json');

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'Use POST.');

$config = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$apiKey = getenv('OPENAI_API_KEY') ?: ($config['apiKey'] ?? '');
if ($apiKey === '') fail(500, 'AI summaries are not set up yet: add an OpenAI API key in api/config.php on the server.');

$input = json_decode((string) file_get_contents('php://input'), true);
$items = $input['items'] ?? null;
if (!is_array($items) || count($items) === 0 || count($items) > 10) fail(400, 'Send between 1 and 10 items.');

$system = "You write entries for a university internship logbook from an intern's own daily work notes.\n"
    . "Write ONE flowing paragraph in past tense that walks through the week in order, e.g.:\n"
    . "\"Got the ERP gateway dev environment running and the test suite passing, then fixed a login redirect bug with a unit test to back it up. "
    . "Mid-week, picked up the invoice export ticket at sprint planning and built and Postman-tested the export endpoint. "
    . "Closed the week by reviewing a teammate's PR and updating the API docs.\"\n"
    . "Use only what the notes say — never invent tasks, tools, or results.\n"
    . "Fit the paragraph to the section title you're given. Plain text only: no bullet points, headings or markdown.";

function openai(string $apiKey, string $system, string $user): string
{
    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer {$apiKey}"],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => 'gpt-4o-mini',
            'max_tokens' => 800,
            'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
        ]),
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) fail(502, "Could not reach OpenAI ({$err}). Check the server has internet access.");
    $body = json_decode((string) $raw, true);
    if ($status !== 200) fail(502, 'OpenAI returned an error: ' . ($body['error']['message'] ?? "HTTP {$status}"));
    return trim((string) ($body['choices'][0]['message']['content'] ?? ''));
}

$summaries = [];
foreach ($items as $item) {
    $label = mb_substr((string) ($item['label'] ?? ''), 0, 300);
    $text = mb_substr(trim((string) ($item['text'] ?? '')), 0, 20000);
    $summaries[] = $text === '' ? '' : openai($apiKey, $system, "Logbook section: {$label}\n\nThis week's notes:\n{$text}");
}
echo json_encode(['summaries' => $summaries]);
