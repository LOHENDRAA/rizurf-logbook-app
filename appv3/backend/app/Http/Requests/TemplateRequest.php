<?php

namespace App\Http\Requests;

use App\Models\LogbookTemplate;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use ZipArchive;

class TemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Multipart create sends the JSON parts as strings; decode them so both
     * create (multipart) and update (JSON) validate the same shape.
     */
    protected function prepareForValidation(): void
    {
        foreach (['placeholders', 'pageRoles'] as $key) {
            $value = $this->input($key);
            if (is_string($value)) {
                $this->merge([$key => json_decode($value, true)]);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $kind = 'placeholders.*.anchor.kind';

        return [
            'file' => [$this->isMethod('post') ? 'required' : 'prohibited', 'file', 'max:10240', 'extensions:docx,pdf'],
            'universityName' => ['required', 'string', 'max:200'],
            'placeholders' => ['required', 'array', 'max:500'],
            'placeholders.*' => ['array:id,label,binding,source,region,dayIndex,dayMode,dateRole,anchor'],
            'placeholders.*.id' => ['required', 'string', 'max:64'],
            'placeholders.*.label' => ['required', 'string', 'max:300'],
            'placeholders.*.binding' => ['required', Rule::in(['cover', 'daily', 'period', 'date', 'free', 'signature'])],
            'placeholders.*.source' => ['required', Rule::in(['marker', 'label', 'manual'])],
            'placeholders.*.region' => ['required', Rule::in(['cover', 'unit'])],
            'placeholders.*.dayIndex' => ['nullable', 'integer', 'between:0,31'],
            'placeholders.*.dayMode' => ['nullable', Rule::in(['weekday', 'nth'])],
            'placeholders.*.dateRole' => ['nullable', Rule::in(['day', 'start', 'end', 'range', 'number'])],
            'placeholders.*.anchor' => ['required', 'array:kind,page,x,y,w,h,whiteout,table,row,col,paragraph,start,end'],
            $kind => ['required', Rule::in(['pdf', 'docx-cell', 'docx-text'])],
            'placeholders.*.anchor.page' => ["required_if:{$kind},pdf", 'integer', 'min:0'],
            'placeholders.*.anchor.x' => ["required_if:{$kind},pdf", 'numeric'],
            'placeholders.*.anchor.y' => ["required_if:{$kind},pdf", 'numeric'],
            'placeholders.*.anchor.w' => ["required_if:{$kind},pdf", 'numeric', 'min:0'],
            'placeholders.*.anchor.h' => ["required_if:{$kind},pdf", 'numeric', 'min:0'],
            'placeholders.*.anchor.whiteout' => ['boolean'],
            'placeholders.*.anchor.table' => ["required_if:{$kind},docx-cell", 'array', 'min:1', 'max:2'],
            'placeholders.*.anchor.table.*' => ['integer', 'min:0'],
            'placeholders.*.anchor.row' => ["required_if:{$kind},docx-cell", 'integer', 'min:0'],
            'placeholders.*.anchor.col' => ["required_if:{$kind},docx-cell", 'integer', 'min:0'],
            'placeholders.*.anchor.paragraph' => ["required_if:{$kind},docx-text", 'integer', 'min:0'],
            'placeholders.*.anchor.start' => ["required_if:{$kind},docx-text", 'integer', 'min:0'],
            'placeholders.*.anchor.end' => ["required_if:{$kind},docx-text", 'integer', 'min:0'],
            'pageRoles' => ['nullable', 'array'],
            'pageRoles.*' => [Rule::in(['cover', 'unit', 'ignore'])],
            'unitStartBlock' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $placeholders = $this->input('placeholders');
            if (is_array($placeholders) && ! collect($placeholders)->contains(fn ($p) => is_array($p) && ($p['region'] ?? null) === 'unit')) {
                $validator->errors()->add('placeholders', 'Add at least one placeholder to the part that repeats every week.');
            }

            $file = $this->file('file');
            if ($file instanceof UploadedFile && ! self::contentMatches($file)) {
                $validator->errors()->add('file', 'This file is not a real .docx or .pdf. Upload the original logbook file.');
            }

            $format = $file instanceof UploadedFile
                ? strtolower($file->getClientOriginalExtension())
                : LogbookTemplate::query()->find($this->route('id'))?->format;
            if ($format === 'pdf' && ! in_array('unit', (array) $this->input('pageRoles'), true)) {
                $validator->errors()->add('pageRoles', 'Mark at least one page as "Repeats every week".');
            }
            if ($format === 'docx' && $this->input('unitStartBlock') === null) {
                $validator->errors()->add('unitStartBlock', 'Choose where the repeating part starts.');
            }
        }];
    }

    private static function contentMatches(UploadedFile $file): bool
    {
        $path = $file->getRealPath();
        if ($path === false) {
            return false;
        }

        if (strtolower($file->getClientOriginalExtension()) === 'pdf') {
            return file_get_contents($path, false, null, 0, 5) === '%PDF-';
        }

        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            return false;
        }
        $isWord = $zip->locateName('word/document.xml') !== false;
        $zip->close();

        return $isWord;
    }
}
