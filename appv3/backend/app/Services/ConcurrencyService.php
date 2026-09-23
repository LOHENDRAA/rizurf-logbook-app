<?php

namespace App\Services;

use App\Models\Week;
use App\Support\Problem;
use Symfony\Component\HttpFoundation\Response;

/**
 * Opaque version handling: versions travel as quoted ETags and return via
 * If-Match. Any disagreement is a 412 STALE_VERSION, never a silent
 * overwrite. There is no server-side mutation auto-retry.
 */
final class ConcurrencyService
{
    public static function etagFor(string $version): string
    {
        return '"'.$version.'"';
    }

    /**
     * Strip weak prefix and quotes: W/"v1-2" -> v1-2.
     */
    public static function normalize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);

        if ($value === '' || $value === '*') {
            return $value === '' ? null : $value;
        }

        if (str_starts_with($value, 'W/')) {
            $value = substr($value, 2);
        }

        return trim($value, '"');
    }

    /**
     * Enforce optimistic concurrency. The header (when sent) and the body
     * version (when part of the contract) must both agree with the stored
     * version.
     */
    public static function assertMatch(Week $week, ?string $ifMatch, ?string $bodyVersion = null): void
    {
        $current = $week->version;
        $header = self::normalize($ifMatch);

        if ($header !== null && $header !== '*' && $header !== $current) {
            Problem::throw(
                Response::HTTP_PRECONDITION_FAILED,
                'STALE_VERSION',
                'This item changed elsewhere. Compare and retry.'
            );
        }

        if ($bodyVersion !== null && $bodyVersion !== $current) {
            Problem::throw(
                Response::HTTP_PRECONDITION_FAILED,
                'STALE_VERSION',
                'This item changed elsewhere. Compare and retry.'
            );
        }

        if ($header !== null && $header !== '*' && $bodyVersion !== null && $header !== $bodyVersion) {
            Problem::throw(
                Response::HTTP_PRECONDITION_FAILED,
                'STALE_VERSION',
                'This item changed elsewhere. Compare and retry.'
            );
        }
    }

    /**
     * Next opaque version: increments the trailing counter (v3-1 -> v3-2).
     */
    public static function bump(string $version): string
    {
        if (preg_match('/-(\d+)$/', $version, $m)) {
            return substr($version, 0, -strlen($m[0])).'-'.((int) $m[1] + 1);
        }

        return $version.'-2';
    }
}
