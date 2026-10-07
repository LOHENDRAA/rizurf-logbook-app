<?php

namespace Tests\Feature;

use App\Models\JournalEntry;
use Tests\TestCase;

/** An intern's own projects (AI organising, piece 2). TestCase pins "today" to 2026-09-21 in Kuala Lumpur. */
class ProjectsTest extends TestCase
{
    private function create(string $name, ?string $description = null): string
    {
        return (string) $this->portal('POST', '/api/v1/projects', ['name' => $name, 'description' => $description])
            ->assertCreated()->json('id');
    }

    public function test_an_intern_creates_renames_and_deletes_a_project(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway', 'Auth work');

        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'ERP Gateway v2'])
            ->assertOk()->assertExactJson(['id' => $id, 'name' => 'ERP Gateway v2', 'description' => 'Auth work']);
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('projects', [['id' => $id, 'name' => 'ERP Gateway v2', 'description' => 'Auth work']]);

        $this->portal('DELETE', "/api/v1/projects/{$id}")->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('projects', []);
    }

    public function test_names_are_unique_per_person_ignoring_case(): void
    {
        $this->be($this->user('student-1'));
        $this->create('ERP gateway');
        $this->portal('POST', '/api/v1/projects', ['name' => ' erp GATEWAY '])->assertUnprocessable();
        $this->portal('POST', '/api/v1/projects', ['name' => str_repeat('a', 121)])->assertUnprocessable();
        $this->portal('POST', '/api/v1/projects', ['name' => 'Ok', 'description' => str_repeat('a', 501)])->assertUnprocessable();
        $this->portal('POST', '/api/v1/projects', ['name' => '   '])->assertUnprocessable();

        $this->be($this->user('student-2'));
        $this->create('ERP gateway'); // someone else may use the same name
    }

    public function test_renaming_onto_another_of_your_projects_is_refused(): void
    {
        $this->be($this->user('student-1'));
        $this->create('ERP gateway');
        $id = $this->create('Invoices');
        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'erp gateway'])->assertUnprocessable();
        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'INVOICES'])->assertOk(); // its own name, new case
    }

    public function test_someone_elses_project_is_not_found(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway');

        $this->be($this->user('student-2'));
        $this->portal('PATCH', "/api/v1/projects/{$id}", ['name' => 'Mine now'])->assertNotFound();
        $this->portal('DELETE', "/api/v1/projects/{$id}")->assertNotFound();
    }

    public function test_a_project_in_use_cannot_be_deleted(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway');
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page.'])->assertNoContent();
        JournalEntry::query()->where('user_id', 'student-1')->update(['project_id' => $id]);

        $this->portal('DELETE', "/api/v1/projects/{$id}")->assertStatus(409)
            ->assertJsonPath('error.message', 'Entries still use this project. Move them first.');
    }

    public function test_supervisors_have_no_projects(): void
    {
        $this->be($this->user('supervisor-1'));
        $this->portal('POST', '/api/v1/projects', ['name' => 'Mine'])->assertForbidden();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('projects', []);
    }

    public function test_the_journal_carries_each_entrys_project_and_items_and_typing_keeps_them(): void
    {
        $this->be($this->user('student-1'));
        $id = $this->create('ERP gateway');
        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page.'])->assertNoContent();
        $items = [['id' => 'i1', 'kind' => 'activity', 'text' => 'Built the login page', 'status' => 'accepted']];
        JournalEntry::query()->where('user_id', 'student-1')->first()?->forceFill(['project_id' => $id, 'items' => $items])->save();

        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => 'Built the login page, then tested it.'])->assertNoContent();
        $this->portal('GET', '/api/v1/journal')->assertJsonPath('entries', [[
            'date' => '2026-09-21', 'text' => 'Built the login page, then tested it.', 'projectId' => $id, 'items' => $items,
        ]]);

        $this->portal('PUT', '/api/v1/journal/2026-09-21', ['text' => ' '])->assertNoContent();
        $this->assertSame(0, JournalEntry::query()->count());
    }
}
