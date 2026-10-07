<?php

namespace Tests\Feature;

use App\Models\Project;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OrganizationTest extends TestCase
{
    /** @param array<string, mixed> $body */
    private function organization(array $body, string $date = '2026-09-21'): TestResponse
    {
        return $this->portal('PUT', "/api/v1/journal/{$date}/organization", $body);
    }

    /** @return array<string, string> */
    private function item(string $kind, string $text, string $status = 'accepted', string $id = 'i1'): array
    {
        return ['id' => $id, 'kind' => $kind, 'text' => $text, 'status' => $status];
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->be($this->user('student-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page.'])->assertNoContent();
    }

    public function test_saves_the_items_and_an_existing_project(): void
    {
        $id = (string) $this->portal('POST', '/api/v1/projects', ['name' => 'ERP gateway'])->json('id');
        $items = [$this->item('project', 'ERP gateway'), $this->item('activity', 'Built the login page', 'suggested', 'i2')];

        $this->organization(['projectId' => $id, 'items' => $items])->assertOk()->assertExactJson([
            'projectId' => $id, 'items' => $items, 'projects' => [['id' => $id, 'name' => 'ERP gateway', 'description' => null]],
        ]);
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.projectId', $id)->assertJsonPath('entries.0.items', $items);
    }

    public function test_a_new_project_name_creates_it_and_the_same_name_in_another_case_reuses_it(): void
    {
        $first = $this->organization(['newProjectName' => 'Invoice export', 'items' => [$this->item('project', 'Invoice export')]])
            ->assertOk()->json('projectId');
        $again = $this->organization(['newProjectName' => '  invoice EXPORT ', 'items' => [$this->item('project', 'invoice EXPORT')]])
            ->assertOk()->json('projectId');

        $this->assertSame($first, $again);
        $this->assertSame(1, Project::query()->where('user_id', 'student-1')->count());
    }

    public function test_clearing_the_project(): void
    {
        $this->organization(['newProjectName' => 'Invoice export', 'items' => []])->assertOk();
        $this->organization(['projectId' => null, 'items' => []])->assertOk()->assertJsonPath('projectId', null);
    }

    public function test_someone_elses_project_is_refused(): void
    {
        $this->be($this->user('student-2'));
        $theirs = (string) $this->portal('POST', '/api/v1/projects', ['name' => 'Theirs'])->json('id');

        $this->be($this->user('student-1'));
        $this->organization(['projectId' => $theirs, 'items' => []])->assertUnprocessable();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries.0.projectId', null);
    }

    public function test_bad_items_are_refused(): void
    {
        $this->organization(['items' => [$this->item('feeling', 'Happy')]])->assertUnprocessable();
        $this->organization(['items' => [$this->item('skill', 'Testing', 'maybe')]])->assertUnprocessable();
        $this->organization(['items' => [$this->item('skill', str_repeat('a', 301))]])->assertUnprocessable();
        $this->organization(['items' => [$this->item('skill', '   ')]])->assertUnprocessable();
        $this->organization(['items' => array_map(fn (int $i) => $this->item('skill', "S{$i}", 'rejected', "i{$i}"), range(1, 41))])->assertUnprocessable();
        $this->organization(['items' => array_map(fn (int $i) => $this->item('skill', "S{$i}", 'rejected', "i{$i}"), range(1, 40))])->assertOk();
        $this->organization(['newProjectName' => str_repeat('a', 121), 'items' => []])->assertUnprocessable();
    }

    public function test_a_day_without_an_entry_is_not_found(): void
    {
        $this->organization(['items' => []], '2026-09-18')->assertNotFound();
    }

    public function test_supervisors_cannot_organize(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Met the interns.'])->assertNoContent();
        $this->organization(['items' => []])->assertForbidden();
    }
}
