<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class WeekValuesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'templateId' => ['required', 'string', 'max:64'],
            'values' => ['present', 'array', 'max:500'],
            'values.*' => ['nullable', 'string', 'max:5000'],
            'autofilled' => ['present', 'array', 'max:500'],
            'autofilled.*' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
