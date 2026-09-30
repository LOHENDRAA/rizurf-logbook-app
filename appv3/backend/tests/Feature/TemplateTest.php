<?php

namespace Tests\Feature;

use App\Models\LogbookTemplate;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;
use ZipArchive;

class TemplateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    private function docx(string $name = 'taylors.docx'): UploadedFile
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'docx');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('word/document.xml', '<w:document/>');
        $zip->close();

        return new UploadedFile($path, $name, null, null, true);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function cellPlaceholders(): array
    {
        return [[
            'id' => 'ph-1',
            'label' => 'Tasks this week',
            'binding' => 'period',
            'source' => 'marker',
            'region' => 'unit',
            'anchor' => ['kind' => 'docx-cell', 'table' => [0], 'row' => 1, 'col' => 1],
        ]];
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $placeholders
     */
    private function createDocx(string $university = 'Universiti Teknologi Malaysia', ?array $placeholders = null): TestResponse
    {
        $this->be($this->user('supervisor-1'));

        return $this->portal('POST', '/api/v1/templates', [
            'file' => $this->docx(),
            'universityName' => $university,
            'placeholders' => json_encode($placeholders ?? $this->cellPlaceholders()),
            'unitStartBlock' => 0,
        ]);
    }

    public function test_supervisor_creates_a_docx_template(): void
    {
        $response = $this->createDocx();

        $response->assertCreated()
            ->assertHeader('ETag')
            ->assertJsonPath('universityName', 'Universiti Teknologi Malaysia')
            ->assertJsonPath('format', 'docx')
            ->assertJsonPath('placeholders.0.anchor.kind', 'docx-cell')
            ->assertJsonPath('unitStartBlock', 0);
        Storage::disk('local')->assertExists('templates/'.$response->json('id').'/original.docx');

        $this->portal('GET', '/api/v1/templates/'.$response->json('id'))
            ->assertOk()
            ->assertHeader('ETag', $response->headers->get('ETag'))
            ->assertJsonPath('fileName', 'taylors.docx');
    }

    public function test_supervisor_creates_a_pdf_template(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('POST', '/api/v1/templates', [
            'file' => UploadedFile::fake()->createWithContent('apu.pdf', "%PDF-1.4\n%%EOF"),
            'universityName' => 'Asia Pacific University',
            'placeholders' => json_encode([[
                'id' => 'ph-1', 'label' => 'Week', 'binding' => 'date', 'source' => 'label', 'region' => 'unit', 'dateRole' => 'number',
                'anchor' => ['kind' => 'pdf', 'page' => 0, 'x' => 72, 'y' => 700, 'w' => 120, 'h' => 14],
            ]]),
            'pageRoles' => json_encode(['unit']),
        ])->assertCreated()->assertJsonPath('pageRoles', ['unit']);
    }

    public function test_rejects_content_that_does_not_match_the_extension(): void
    {
        $this->be($this->user('supervisor-1'));

        $this->portal('POST', '/api/v1/templates', [
            'file' => UploadedFile::fake()->createWithContent('fake.pdf', 'just some text'),
            'universityName' => 'Asia Pacific University',
            'placeholders' => json_encode($this->cellPlaceholders()),
            'pageRoles' => json_encode(['unit']),
        ])->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_rejects_files_over_10_mb(): void
    {
        $this->be($this->user('supervisor-1'));

        $response = $this->portal('POST', '/api/v1/templates', [
            'file' => UploadedFile::fake()->create('big.pdf', 10241),
            'universityName' => 'Asia Pacific University',
            'placeholders' => json_encode($this->cellPlaceholders()),
            'pageRoles' => json_encode(['unit']),
        ]);

        $response->assertUnprocessable();
        $this->assertStringContainsString('10240', implode(' ', $response->json('errors.file')));
    }

    public function test_duplicate_university_is_a_conflict_after_normalising_the_name(): void
    {
        $this->createDocx("Taylor's University")->assertCreated();

        $this->createDocx("  taylor's   UNIVERSITY ")
            ->assertStatus(409)
            ->assertJsonPath('code', 'UNIVERSITY_TAKEN');
    }

    public function test_rejects_malformed_placeholders(): void
    {
        $good = $this->cellPlaceholders()[0];
        $cases = [
            'bad binding' => [array_merge($good, ['binding' => 'secret'])],
            'cell anchor without row' => [array_merge($good, ['anchor' => ['kind' => 'docx-cell', 'table' => [0], 'col' => 1]])],
            'text anchor without end' => [array_merge($good, ['anchor' => ['kind' => 'docx-text', 'paragraph' => 3, 'start' => 0]])],
            'unknown key' => [array_merge($good, ['evil' => 'x'])],
            'empty label' => [array_merge($good, ['label' => ''])],
            'no unit placeholder' => [array_merge($good, ['region' => 'cover'])],
            'too many' => array_fill(0, 501, $good),
        ];

        foreach ($cases as $name => $placeholders) {
            $status = $this->createDocx("Uni {$name}", $placeholders)->status();
            $this->assertSame(422, $status, "case '{$name}' should be rejected");
        }
    }

    public function test_only_supervisors_manage_templates(): void
    {
        $this->be($this->user('student-1'));

        $this->portal('POST', '/api/v1/templates', [
            'file' => $this->docx(),
            'universityName' => 'Universiti Teknologi Malaysia',
            'placeholders' => json_encode($this->cellPlaceholders()),
            'unitStartBlock' => 0,
        ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_interns_list_universities_without_counts(): void
    {
        $id = $this->createDocx()->json('id');

        $this->be($this->user('student-3'));
        $this->portal('GET', '/api/v1/templates')
            ->assertOk()
            ->assertExactJson(['data' => [['id' => $id, 'universityName' => 'Universiti Teknologi Malaysia']]]);
    }

    public function test_list_counts_students_by_normalised_university(): void
    {
        $this->createDocx('  universiti teknologi MALAYSIA')->assertCreated();

        $this->portal('GET', '/api/v1/templates')
            ->assertOk()
            ->assertJsonPath('data.0.studentCount', 1)
            ->assertJsonPath('data.0.placeholderCount', 1)
            ->assertJsonStructure(['data' => [['id', 'universityName', 'format', 'version', 'updatedAt']]]);
    }

    public function test_update_requires_a_current_if_match(): void
    {
        $created = $this->createDocx();
        $id = $created->json('id');
        $etag = (string) $created->headers->get('ETag');
        $body = ['universityName' => 'Universiti Teknologi Malaysia', 'placeholders' => $this->cellPlaceholders(), 'unitStartBlock' => 2];

        $this->portal('PUT', "/api/v1/templates/{$id}", $body)->assertStatus(428);
        $this->portal('PUT', "/api/v1/templates/{$id}", $body, ['If-Match' => '"stale"'])->assertStatus(412);

        $updated = $this->portal('PUT', "/api/v1/templates/{$id}", $body, ['If-Match' => $etag]);
        $updated->assertOk()->assertJsonPath('unitStartBlock', 2);
        $this->assertNotSame($etag, $updated->headers->get('ETag'));
    }

    public function test_renaming_a_university_keeps_its_interns_linked(): void
    {
        $created = $this->createDocx();
        $id = $created->json('id');

        $this->portal('PUT', "/api/v1/templates/{$id}", [
            'universityName' => 'UTM Johor Bahru',
            'placeholders' => $this->cellPlaceholders(),
            'unitStartBlock' => 0,
        ], ['If-Match' => (string) $created->headers->get('ETag')])->assertOk();

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/me/template')->assertOk()->assertJsonPath('id', $id);
    }

    public function test_renaming_onto_another_university_is_a_conflict(): void
    {
        $a = $this->createDocx('University A');
        $this->createDocx('University B')->assertCreated();

        $this->portal('PUT', '/api/v1/templates/'.$a->json('id'), [
            'universityName' => 'university  b',
            'placeholders' => $this->cellPlaceholders(),
            'unitStartBlock' => 0,
        ], ['If-Match' => (string) $a->headers->get('ETag')])->assertStatus(409)->assertJsonPath('code', 'UNIVERSITY_TAKEN');
    }

    public function test_delete_requires_if_match_and_removes_the_file(): void
    {
        $created = $this->createDocx();
        $id = $created->json('id');

        $this->portal('DELETE', "/api/v1/templates/{$id}")->assertStatus(428);
        $this->portal('DELETE', "/api/v1/templates/{$id}", [], ['If-Match' => (string) $created->headers->get('ETag')])->assertNoContent();

        Storage::disk('local')->assertMissing("templates/{$id}/original.docx");
        $this->assertNull(LogbookTemplate::query()->find($id));
    }

    public function test_file_is_served_to_supervisors_and_matching_students_only(): void
    {
        $id = $this->createDocx()->json('id');

        $this->portal('GET', "/api/v1/templates/{$id}/file")->assertOk();

        $this->be($this->user('student-1'));
        $this->portal('GET', "/api/v1/templates/{$id}/file")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        $this->be($this->user('student-3'));
        $this->portal('GET', "/api/v1/templates/{$id}/file")->assertForbidden();
    }

    public function test_me_template_matches_the_students_university(): void
    {
        $id = $this->createDocx()->json('id');

        $this->be($this->user('student-1'));
        $this->portal('GET', '/api/v1/me/template')
            ->assertOk()
            ->assertHeader('ETag')
            ->assertJsonPath('id', $id)
            ->assertJsonPath('fileUrl', "/api/v1/templates/{$id}/file");

        $this->be($this->user('student-3'));
        $this->portal('GET', '/api/v1/me/template')->assertNotFound();

        $this->be($this->user('supervisor-1'));
        $this->portal('GET', '/api/v1/me/template')->assertNotFound();
    }
}
