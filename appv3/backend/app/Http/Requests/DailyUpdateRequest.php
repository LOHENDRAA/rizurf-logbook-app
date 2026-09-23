<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DailyUpdateRequest extends FormRequest
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
            'date' => ['required', 'string', 'date_format:Y-m-d'],
            'body' => ['present', 'string'],
        ];
    }
}
