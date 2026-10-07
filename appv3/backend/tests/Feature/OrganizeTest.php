<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OrganizeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page. Learned about CSRF.'])->assertNoContent();
        $this->portal('POST', '/api/v1/projects', ['name' => 'ERP gateway'])->assertCreated();
        $this->openAiReply = (string) json_encode([
            'project' => 'ERP gateway', 'activities' => ['Built the login page'], 'learning' => ['How CSRF tokens work'], 'skills' => ['Web security'],
        ]);
    }

    private function organize(string $date = '2026-09-21'): TestResponse
    {
        return $this->portal('POST', "/api/v1/journal/{$date}/organize");
    }

    public function test_returns_suggestions_from_openai_and_saves_nothing(): void
    {
        $this->organize()->assertOk()->assertExactJson([
            'project' => 'ERP gateway', 'activities' => ['Built the login page'], 'learning' => ['How CSRF tokens work'], 'skills' => ['Web security'],
        ]);

        Http::assertSent(fn (ClientRequest $r) => $r->url() === 'https://api.openai.com/v1/chat/completions'
            && $r->hasHeader('Authorization', 'Bearer sk-test-key')
            && $r['model'] === 'gpt-4o-mini'
            && $r['response_format'] === ['type' => 'json_object']
            && str_contains($r['messages'][1]['content'], 'Learned about CSRF.')
            && str_contains($r['messages'][1]['content'], 'ERP gateway'));
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.items', []);
    }

    public function test_long_lists_and_texts_are_cut(): void
    {
        $this->openAiReply = (string) json_encode([
            'project' => null,
            'activities' => ['a1', 'a2', 'a3', 'a4', 'a5', str_repeat('x', 400)],
            'learning' => ['l1', ' ', 'l2', 'l3', 'l4'],
            'skills' => ['s1', 's2', 's3', 's4'],
        ]);
        $this->organize()->assertOk()->assertExactJson([
            'project' => null, 'activities' => ['a1', 'a2', 'a3', 'a4'], 'learning' => ['l1', 'l2', 'l3'], 'skills' => ['s1', 's2', 's3'],
        ]);
    }

    public function test_a_malformed_reply_is_a_503(): void
    {
        foreach (['not json', '{"project": 3, "activities": []}', '{"activities": "one"}', '[]'] as $reply) {
            $this->openAiReply = $reply;
            $this->organize()->assertStatus(503)
                ->assertJsonPath('error.message', "Your entry is saved. I couldn't organize it right now. Try again");
        }
    }

    public function test_no_key_or_openai_down_is_a_503(): void
    {
        $this->openAiStatus = 500;
        $this->openAiReply = null;
        $this->organize()->assertStatus(503)->assertDontSee('sk-tes');

        $this->openAiStatus = 200;
        $this->openAiDown = true;
        $this->organize()->assertStatus(503);

        config(['services.openai.key' => '']);
        $this->organize()->assertStatus(503);
    }

    public function test_a_day_without_an_entry_is_not_found(): void
    {
        $this->organize('2026-09-18')->assertNotFound();
    }

    public function test_supervisors_cannot_organize(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the interns.'])->assertNoContent();
        $this->organize()->assertForbidden();
    }

    public function test_the_daily_limit_is_per_person_and_separate_from_summaries(): void
    {
        config(['portal.organizes_per_day' => 2, 'portal.summaries_per_day' => 1]);
        $this->organize()->assertOk();
        $this->organize()->assertOk();
        $this->organize()->assertStatus(429)->assertJsonPath('error.message', "You've organized 2 times today. Try again tomorrow.");

        $this->portal('POST', '/api/v1/summaries', ['items' => [['label' => 'Tasks', 'text' => 'Built it']]])->assertOk();
    }
}
