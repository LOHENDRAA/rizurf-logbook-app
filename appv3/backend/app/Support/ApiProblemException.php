<?php

namespace App\Support;

use RuntimeException;

/**
 * Domain failure rendered as an RFC 9457 problem+json response.
 */
final class ApiProblemException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        public readonly string $title,
        public readonly ?string $detail = null,
        public readonly ?array $errors = null,
    ) {
        parent::__construct($title, $status);
    }
}
