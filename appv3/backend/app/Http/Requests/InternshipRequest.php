<?php

namespace App\Http\Requests;

use App\Services\WeekService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class InternshipRequest extends FormRequest
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
            'templateId' => ['required', 'string', 'exists:logbook_templates,id'],
            'startDate' => ['required', 'date_format:Y-m-d'],
            'endDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:startDate'],
            'coverValues' => ['present', 'array', 'max:500'],
            'coverValues.*' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $start = $this->input('startDate');
            $end = $this->input('endDate');

            if (is_string($start) && is_string($end) && WeekService::isValidDate($start) && WeekService::isValidDate($end)
                && WeekService::addDays($start, 366) < $end) {
                $validator->errors()->add('endDate', 'An internship can be at most one year long.');
            }
        }];
    }
}
