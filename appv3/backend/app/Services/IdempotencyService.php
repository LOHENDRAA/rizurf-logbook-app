<?php

namespace App\Services;

use App\Models\IdempotencyKey;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

/**
 * DB-backed idempotency: the first request with a (scope, key) pair executes
 * and its status/body are stored for 24h; retries with the same request hash
 * replay the stored response without re-executing, while a reused key with a
 * different hash is a 409 VERSION_CONFLICT.
 */
final class IdempotencyService
{
    public function requireKey(?string $key): string
    {
        $key = trim((string) $key);

        if ($key === '') {
            Problem::throw(
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'VALIDATION_FAILED',
                'Idempotency-Key is required.',
                null,
                ['Idempotency-Key' => ['An Idempotency-Key header is required for this transition.']]
            );
        }

        return $key;
    }

    public static function hash(string $method, string $path, mixed $body): string
    {
        return hash('sha256', strtoupper($method).'|'.$path.'|'.json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /**
     * @return array{status: int, body: array, etag: string|null}|null
     */
    public function replay(string $scope, string $key, string $requestHash): ?array
    {
        $record = IdempotencyKey::query()->where('scope', $scope)->where('key', $key)->first();

        if ($record === null) {
            return null;
        }

        if ($record->expires_at !== null && Carbon::now()->greaterThan($record->expires_at)) {
            $record->delete();

            return null;
        }

        if (! hash_equals($record->request_hash, $requestHash)) {
            Problem::throw(
                Response::HTTP_CONFLICT,
                'VERSION_CONFLICT',
                'This Idempotency-Key was already used for a different request.'
            );
        }

        return [
            'status' => $record->response_status,
            'body' => $record->response_body ?? [],
            'etag' => $record->response_etag,
        ];
    }

    public function replayResponse(array $replay): JsonResponse
    {
        $response = new JsonResponse($replay['body'], $replay['status']);

        if (is_string($replay['etag']) && $replay['etag'] !== '') {
            $response->headers->set('ETag', $replay['etag']);
        }

        return $response;
    }

    public function store(
        string $scope,
        string $key,
        string $requestHash,
        int $status,
        array $body,
        ?string $etag = null,
        ?int $ttlHours = null,
    ): void {
        $ttlHours ??= (int) config('portal.idempotency_ttl_hours', 24);

        IdempotencyKey::updateOrCreate(
            ['scope' => $scope, 'key' => $key],
            [
                'request_hash' => $requestHash,
                'response_status' => $status,
                'response_body' => $body,
                'response_etag' => $etag,
                'expires_at' => Carbon::now()->addHours(max(1, $ttlHours)),
            ]
        );
    }

    public function prune(): int
    {
        return IdempotencyKey::query()->where('expires_at', '<', Carbon::now())->delete();
    }
}
