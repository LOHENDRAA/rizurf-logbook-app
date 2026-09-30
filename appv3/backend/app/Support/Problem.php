<?php

namespace App\Support;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

/**
 * The Rizurf error envelope (RIZURF_API_TEMPLATE.md SS-5):
 * {"error": {"code", "message", "correlation_id", "details"}}.
 *
 * Internal details are never leaked; unexpected failures collapse to INTERNAL_ERROR.
 */
final class Problem
{
    public static function correlationId(Request $request): string
    {
        $id = $request->attributes->get('correlationId');

        return is_string($id) && $id !== '' ? $id : (string) Str::uuid();
    }

    public static function response(
        int $status,
        string $code,
        string $title,
        ?string $detail = null,
        ?array $errors = null,
        ?Request $request = null,
    ): JsonResponse {
        return new JsonResponse(['error' => [
            'code' => $code,
            'message' => $detail !== null && $detail !== '' ? "{$title} {$detail}" : $title,
            'correlation_id' => $request ? self::correlationId($request) : (string) Str::uuid(),
            'details' => $errors !== null && $errors !== [] ? $errors : null,
        ]], $status);
    }

    public static function throw(
        int $status,
        string $code,
        string $title,
        ?string $detail = null,
        ?array $errors = null,
    ): never {
        throw new ApiProblemException($status, $code, $title, $detail, $errors);
    }

    public static function fromThrowable(Throwable $e, Request $request): JsonResponse
    {
        if ($e instanceof ApiProblemException) {
            return self::response($e->status, $e->errorCode, $e->title, $e->detail, $e->errors, $request);
        }

        if ($e instanceof ValidationException) {
            return self::response(
                Response::HTTP_UNPROCESSABLE_ENTITY,
                'VALIDATION_ERROR',
                'Some details need attention before saving.',
                null,
                $e->errors(),
                $request
            );
        }

        if ($e instanceof AuthenticationException || $e instanceof TokenMismatchException) {
            return self::response(
                Response::HTTP_UNAUTHORIZED,
                'UNAUTHORIZED',
                'Your session has expired. Please sign in again.',
                null,
                null,
                $request
            );
        }

        if ($e instanceof AuthorizationException || $e instanceof AccessDeniedHttpException) {
            return self::response(
                Response::HTTP_FORBIDDEN,
                'FORBIDDEN',
                'You do not have access to this resource.',
                null,
                null,
                $request
            );
        }

        if ($e instanceof NotFoundHttpException || $e instanceof ModelNotFoundException) {
            return self::response(
                Response::HTTP_NOT_FOUND,
                'RESOURCE_NOT_FOUND',
                'The requested resource could not be found.',
                null,
                null,
                $request
            );
        }

        if ($e instanceof TooManyRequestsHttpException) {
            $response = self::response(
                Response::HTTP_TOO_MANY_REQUESTS,
                'RATE_LIMITED',
                'Too many requests. Please wait a moment and try again.',
                null,
                null,
                $request
            );

            if ($e->getHeaders() !== []) {
                $response->headers->add($e->getHeaders());
            }

            return $response;
        }

        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();

            if ($status === 419) {
                return self::response(
                    Response::HTTP_UNAUTHORIZED,
                    'UNAUTHORIZED',
                    'Your session has expired. Please sign in again.',
                    null,
                    null,
                    $request
                );
            }

            // Reserved codes (SS-5) only ever label their own status; anything unlisted gets HTTP_<status>.
            $code = match ($status) {
                400, 422 => 'VALIDATION_ERROR',
                401 => 'UNAUTHORIZED',
                403 => 'FORBIDDEN',
                404 => 'RESOURCE_NOT_FOUND',
                405 => 'METHOD_NOT_ALLOWED',
                409 => 'CONFLICT',
                412 => 'STALE_VERSION',
                413 => 'PAYLOAD_TOO_LARGE',
                429 => 'RATE_LIMITED',
                500 => 'INTERNAL_ERROR',
                503 => 'SERVICE_UNAVAILABLE',
                default => 'HTTP_'.$status,
            };

            $title = $status >= 500
                ? 'Something went wrong on our side. Please try again.'
                : ($e->getMessage() !== '' ? $e->getMessage() : Response::$statusTexts[$status] ?? 'Request failed.');

            $response = self::response($status, $code, $title, null, null, $request);
            // A 405 carries Allow (SS-5); other HTTP errors may carry Retry-After and similar headers.
            $response->headers->add($e->getHeaders());

            return $response;
        }

        report($e);

        return self::response(
            Response::HTTP_INTERNAL_SERVER_ERROR,
            'INTERNAL_ERROR',
            'Something went wrong on our side. Please try again.',
            null,
            null,
            $request
        );
    }
}
