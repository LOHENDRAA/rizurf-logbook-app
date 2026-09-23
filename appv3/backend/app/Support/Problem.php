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
 * RFC 9457 application/problem+json envelope.
 *
 * Every API error carries {title, status, code, requestId}. Internal details
 * are never leaked; unexpected failures collapse to INTERNAL.
 */
final class Problem
{
    public static function requestId(Request $request): string
    {
        $id = $request->attributes->get('requestId');

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
        $payload = [
            'type' => 'about:blank',
            'title' => $title,
            'status' => $status,
            'code' => $code,
            'requestId' => $request ? self::requestId($request) : (string) Str::uuid(),
        ];

        if ($detail !== null && $detail !== '') {
            $payload['detail'] = $detail;
        }

        if ($errors !== null && $errors !== []) {
            $payload['errors'] = $errors;
        }

        return new JsonResponse($payload, $status, ['Content-Type' => 'application/problem+json']);
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
                'VALIDATION_FAILED',
                'Some details need attention before saving.',
                null,
                $e->errors(),
                $request
            );
        }

        if ($e instanceof AuthenticationException || $e instanceof TokenMismatchException) {
            return self::response(
                Response::HTTP_UNAUTHORIZED,
                'UNAUTHENTICATED',
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
                'NOT_FOUND',
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
                    'UNAUTHENTICATED',
                    'Your session has expired. Please sign in again.',
                    null,
                    null,
                    $request
                );
            }

            $code = match (true) {
                $status === 400 => 'VALIDATION_FAILED',
                $status === 405 => 'FORBIDDEN',
                $status === 409 => 'VERSION_CONFLICT',
                $status === 412 => 'STALE_VERSION',
                $status === 422 => 'VALIDATION_FAILED',
                $status === 429 => 'RATE_LIMITED',
                $status >= 500 => 'INTERNAL',
                default => 'INTERNAL',
            };

            $title = $status >= 500
                ? 'Something went wrong on our side. Please try again.'
                : ($e->getMessage() !== '' ? $e->getMessage() : Response::$statusTexts[$status] ?? 'Request failed.');

            return self::response($status, $code, $title, null, null, $request);
        }

        report($e);

        return self::response(
            Response::HTTP_INTERNAL_SERVER_ERROR,
            'INTERNAL',
            'Something went wrong on our side. Please try again.',
            null,
            null,
            $request
        );
    }
}
