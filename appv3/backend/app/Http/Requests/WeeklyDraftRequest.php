<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class WeeklyDraftRequest extends FormRequest
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
            'draft' => ['present', 'string', 'max:5000'],
        ];
    }
}
