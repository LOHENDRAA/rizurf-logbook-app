<?php

namespace App\Http\Controllers\Concerns;

use App\Support\Problem;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

trait PaginatesPortal
{
    /**
     * @return array{page: int, perPage: int}
     */
    protected function pagination(Request $request): array
    {
        $page = $request->query('page', 1);
        $perPage = $request->query('per_page', 20);

        if (! is_numeric($page) || (int) $page < 1) {
            Problem::throw(
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'VALIDATION_FAILED',
                'Invalid pagination parameters.',
                null,
                ['page' => ['Page must be an integer of 1 or more.']]
            );
        }

        if (! is_numeric($perPage) || (int) $perPage < 1 || (int) $perPage > 100) {
            Problem::throw(
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'VALIDATION_FAILED',
                'Invalid pagination parameters.',
                null,
                ['per_page' => ['Per page must be an integer between 1 and 100.']]
            );
        }

        return ['page' => (int) $page, 'perPage' => (int) $perPage];
    }
}
