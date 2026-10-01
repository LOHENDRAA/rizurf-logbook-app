<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class SummaryTest extends TestCase
{
    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function summarize(array $items): TestResponse
    {
        return $this->portal('POST', '/api/v1/summaries', ['items' => $items]);
    }

    private function openAiCalls(): int
    {
        return count(Http::recorded(fn (ClientRequest $request) => str_starts_with($request->url(), 'https://api.openai.com/')));
    }

    public function test_summarizes_each_answer_box_with_openai_using_the_server_key(): void
    {
        $this->be($this->user('student-1'));

        $this->summarize([
            ['label' => 'Tasks done', 'text' => "- set up the dev environment\n- fixed the login bug"],
            ['label' => 'Learnings', 'text' => '- Laravel queues'],
        ])->assertOk()->assertExactJson(['summaries' => ['Summary for Tasks done', 'Summary for Learnings']]);

        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://api.openai.com/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer sk-test-key')
            && $request['model'] === 'gpt-4o-mini'
            && str_contains($request['messages'][1]['content'], 'fixed the login bug'));
    }

    public function test_a_box_without_notes_stays_empty_and_is_not_sent(): void
    {
        $this->be($this->user('student-1'));

        $this->summarize([
            ['label' => 'Tasks done', 'text' => '   '],
            ['label' => 'Learnings', 'text' => '- Laravel queues'],
        ])->assertOk()->assertExactJson(['summaries' => ['', 'Summary for Learnings']]);

        $this->assertSame(1, $this->openAiCalls());
    }

    public function test_the_daily_limit_is_per_person_with_a_friendly_429(): void
    {
        config(['portal.summaries_per_day' => 2]);
        $items = [['label' => 'Tasks done', 'text' => '- fixed the login bug']];

        $this->be($this->user('student-1'));
        $this->summarize($items)->assertOk();
        $this->summarize($items)->assertOk();
        $this->summarize($items)
            ->assertStatus(429)
            ->assertJsonPath('error.code', 'RATE_LIMITED')
            ->assertJsonPath('error.message', "You've used today's AI summaries. Try again tomorrow, or write this week's answers yourself.");

        $this->be($this->user('student-2'));
        $this->summarize($items)->assertOk();
    }

    public function test_the_limit_starts_again_the_next_day_as_the_message_says(): void
    {
        config(['portal.summaries_per_day' => 1]);
        $items = [['label' => 'Tasks done', 'text' => '- fixed the login bug']];

        $this->be($this->user('student-1'));
        $this->summarize($items)->assertOk();
        $this->summarize($items)->assertStatus(429);

        $this->travelTo(now()->addDay()->setTimezone('Asia/Kuala_Lumpur')->setTime(9, 0)); // under 24 hours later
        $this->summarize($items)->assertOk();
    }

    public function test_openai_errors_never_reach_the_browser(): void
    {
        $this->be($this->user('student-1'));
        $this->openAiStatus = 401;

        $response = $this->summarize([['label' => 'Tasks done', 'text' => '- fixed the login bug']]);

        $response->assertStatus(503)->assertJsonPath('error.code', 'SERVICE_UNAVAILABLE');
        $this->assertStringNotContainsString('sk-', (string) $response->getContent());
        $this->assertStringNotContainsString('Incorrect API key', (string) $response->getContent());
    }

    public function test_an_unreachable_openai_is_503(): void
    {
        $this->be($this->user('student-1'));
        $this->openAiDown = true;

        $this->summarize([['label' => 'Tasks done', 'text' => '- fixed the login bug']])
            ->assertStatus(503)
            ->assertJsonPath('error.message', "The AI service didn't answer. Try again in a minute, or write the summary yourself.");
    }

    public function test_without_a_key_the_server_says_so_and_calls_nothing(): void
    {
        $this->be($this->user('student-1'));
        config(['services.openai.key' => null]);

        $this->summarize([['label' => 'Tasks done', 'text' => '- fixed the login bug']])
            ->assertStatus(503)
            ->assertJsonPath('error.message', "AI summaries aren't set up on this server. Chrome 138+ on a desktop has free built-in summaries.");
        $this->assertSame(0, $this->openAiCalls());
    }

    public function test_the_answer_boxes_are_checked(): void
    {
        $this->be($this->user('student-1'));

        $this->summarize([])->assertStatus(422)->assertJsonPath('error.code', 'VALIDATION_ERROR');
        $this->summarize(array_fill(0, 11, ['label' => 'Tasks done', 'text' => '- notes']))->assertStatus(422);
        $this->summarize([['text' => '- notes']])->assertStatus(422);
        $this->assertSame(0, $this->openAiCalls());
    }

    public function test_signed_out_callers_get_401(): void
    {
        $this->summarize([['label' => 'Tasks done', 'text' => '- notes']])->assertUnauthorized();
    }
}
