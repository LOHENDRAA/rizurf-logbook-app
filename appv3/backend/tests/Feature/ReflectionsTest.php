<?php

namespace Tests\Feature;

use Tests\TestCase;

/** An intern's private weekly reflections (piece 4). TestCase pins "today" to Monday 2026-09-21 in Kuala Lumpur. */
class ReflectionsTest extends TestCase
{
    public function test_an_intern_saves_updates_and_clears_a_reflection(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => '  Learned queues.  '])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-21', ['text' => 'This week.'])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => 'Learned queues properly.'])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', [
            ['week' => '2026-09-14', 'text' => 'Learned queues properly.'],
            ['week' => '2026-09-21', 'text' => 'This week.'],
        ]);

        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => '   '])->assertNoContent();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-21', ['text' => null])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);
    }

    public function test_bad_weeks_and_text_are_refused(): void
    {
        $this->be($this->user('student-1'));
        foreach (['2026-09-15', '2026-02-30', 'monday', '14-09-2026'] as $week) {
            $this->portal('PUT', "/api/v1/journal/reflections/{$week}", ['text' => 'x'])->assertUnprocessable();
        }
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => str_repeat('a', 5001)])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => ['not', 'text']])->assertUnprocessable();
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', [])->assertUnprocessable();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);
    }

    public function test_supervisors_have_none_and_interns_see_only_their_own(): void
    {
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => 'Mine.'])->assertNoContent();

        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/reflections/2026-09-14', ['text' => 'x'])->assertForbidden();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);

        $this->be($this->user('student-2'));
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('reflections', []);
    }
}
