<?php

namespace App\Http\Controllers;

use App\Http\Requests\TemplateRequest;
use App\Models\LogbookTemplate;
use App\Models\Placement;
use App\Models\User;
use App\Services\ConcurrencyService;
use App\Support\Problem;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class TemplateController extends Controller
{
    private function requireSupervisor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->isSupervisor()) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'Only supervisors can manage logbook templates.');
        }

        return $user;
    }

    private function assertUniversityFree(string $key, ?string $exceptId = null): void
    {
        $taken = LogbookTemplate::query()
            ->where('university_key', $key)
            ->when($exceptId !== null, fn ($query) => $query->whereKeyNot($exceptId))
            ->exists();

        if ($taken) {
            Problem::throw(Response::HTTP_CONFLICT, 'UNIVERSITY_TAKEN', 'This university already has a template. Edit or replace that one instead.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function fields(TemplateRequest $request, User $user): array
    {
        $name = $request->string('universityName')->trim()->toString();
        $unitStartBlock = $request->validated('unitStartBlock');

        return [
            'university_name' => $name,
            'university_key' => LogbookTemplate::keyFor($name),
            'placeholders' => $request->validated('placeholders'),
            'page_roles' => $request->validated('pageRoles'),
            'unit_start_block' => $unitStartBlock === null ? null : (int) $unitStartBlock,
            'updated_by' => $user->id,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function detail(LogbookTemplate $template): array
    {
        return [
            'id' => $template->id,
            'universityName' => $template->university_name,
            'format' => $template->format,
            'fileName' => $template->file_name,
            'placeholders' => $template->placeholders,
            'pageRoles' => $template->page_roles,
            'unitStartBlock' => $template->unit_start_block,
            'version' => $template->version,
            'updatedAt' => $template->updated_at?->toIso8601String(),
        ];
    }

    private function respond(LogbookTemplate $template, int $status = Response::HTTP_OK): JsonResponse
    {
        return response()
            ->json($this->detail($template), $status)
            ->header('ETag', ConcurrencyService::etagFor($template->version));
    }

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->isSupervisor()) {
            // Interns pick their university from this list under "My internship"; they don't need the counts.
            return response()->json(['data' => LogbookTemplate::query()
                ->orderBy('university_name')
                ->get()
                ->map(fn (LogbookTemplate $template): array => ['id' => $template->id, 'universityName' => $template->university_name])
                ->all()]);
        }

        // ponytail: normalises every placement's university in PHP; store a university_key on placements if this list gets slow.
        $students = Placement::query()
            ->pluck('university_name')
            ->countBy(fn (?string $name): string => LogbookTemplate::keyFor((string) $name));

        $data = LogbookTemplate::query()
            ->orderBy('university_name')
            ->get()
            ->map(fn (LogbookTemplate $template): array => [
                'id' => $template->id,
                'universityName' => $template->university_name,
                'format' => $template->format,
                'placeholderCount' => count($template->placeholders),
                'studentCount' => $students->get($template->university_key, 0),
                'version' => $template->version,
                'updatedAt' => $template->updated_at?->toIso8601String(),
            ])
            ->all();

        return response()->json(['data' => $data]);
    }

    public function store(TemplateRequest $request): JsonResponse
    {
        $user = $this->requireSupervisor($request);
        $fields = $this->fields($request, $user);
        $this->assertUniversityFree($fields['university_key']);

        /** @var UploadedFile $file */
        $file = $request->file('file');
        $format = strtolower($file->getClientOriginalExtension());
        $id = (string) Str::uuid();
        $file->storeAs("templates/{$id}", "original.{$format}", 'local');

        $template = new LogbookTemplate([
            ...$fields,
            'format' => $format,
            'file_name' => $file->getClientOriginalName(),
            'file_path' => "templates/{$id}/original.{$format}",
            'version' => 'v-1',
            'created_by' => $user->id,
        ]);
        $template->id = $id;

        try {
            $template->save();
        } catch (UniqueConstraintViolationException) {
            // Two supervisors created the same university at the same moment.
            Storage::disk('local')->deleteDirectory("templates/{$id}");
            $this->assertUniversityFree($fields['university_key']);
        }

        return $this->respond($template, Response::HTTP_CREATED);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->requireSupervisor($request);

        return $this->respond(LogbookTemplate::query()->findOrFail($id));
    }

    public function update(TemplateRequest $request, string $id): JsonResponse
    {
        $user = $this->requireSupervisor($request);
        ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload the template and try again.');
        $fields = $this->fields($request, $user);

        $template = DB::transaction(function () use ($request, $id, $fields): LogbookTemplate {
            $locked = LogbookTemplate::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            ConcurrencyService::assertMatch($locked, $request->header('If-Match'));
            $this->assertUniversityFree($fields['university_key'], $locked->id);

            if ($locked->university_key !== $fields['university_key']) {
                // Interns are linked to their template by university name, so they follow a rename.
                // ponytail: scans every placement in PHP, like index(); store a university_key on placements if this gets slow.
                $ids = Placement::query()->get(['id', 'university_name'])
                    ->filter(fn (Placement $placement): bool => LogbookTemplate::keyFor($placement->university_name) === $locked->university_key)
                    ->modelKeys();
                Placement::query()->whereKey($ids)->update(['university_name' => $fields['university_name']]);
            }

            $locked->fill([...$fields, 'version' => ConcurrencyService::bump($locked->version)])->save();

            return $locked;
        });

        return $this->respond($template);
    }

    public function destroy(Request $request, string $id): HttpResponse
    {
        $this->requireSupervisor($request);
        ConcurrencyService::requireIfMatch($request->header('If-Match'), 'Reload the template and try again.');

        $template = LogbookTemplate::query()->findOrFail($id);
        ConcurrencyService::assertMatch($template, $request->header('If-Match'));
        $template->delete();
        Storage::disk('local')->deleteDirectory("templates/{$template->id}");

        return response()->noContent();
    }

    public function file(Request $request, string $id): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $template = LogbookTemplate::query()->findOrFail($id);

        if (! $user->isSupervisor() && LogbookTemplate::forUniversity($user->placement?->university_name)?->id !== $template->id) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', 'This template belongs to another university.');
        }

        return Storage::disk('local')->download($template->file_path, $template->file_name, [
            'Content-Type' => $template->format === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]);
    }

    public function mine(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $template = LogbookTemplate::forUniversity($user->placement?->university_name);

        if ($template === null) {
            Problem::throw(Response::HTTP_NOT_FOUND, 'NOT_FOUND', 'Your university has no logbook template yet. Ask your supervisor.');
        }

        return response()
            ->json([...$this->detail($template), 'fileUrl' => "/api/v1/templates/{$template->id}/file"])
            ->header('ETag', ConcurrencyService::etagFor($template->version));
    }
}
