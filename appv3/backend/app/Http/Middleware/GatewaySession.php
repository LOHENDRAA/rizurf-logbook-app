<?php

namespace App\Http\Middleware;

use App\Services\Gateway;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Auto-lock (MICROAPP_AUTH.md §5-§7): on every request from someone signed in, ask the gateway whether
 * their session there is still live. No cache. Fail open when the gateway can't be asked, but only for
 * BACKSTOP_SECONDS after its last good answer. Every response says no-store, so Back and refresh ask again.
 */
final class GatewaySession
{
    public const BACKSTOP_SECONDS = 15 * 60;

    private const NO_STORE = [
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
        'Expires' => '0',
    ];

    public function __construct(private readonly Gateway $gateway) {}

    public function handle(Request $request, Closure $next): Response
    {
        // A dead session carries on as a guest: protected routes answer 401, and a fresh sign-in still goes through.
        $this->signOutIfDead($request);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->add(self::NO_STORE);

        return $response;
    }

    /** Signs out someone the gateway no longer vouches for. */
    private function signOutIfDead(Request $request): void
    {
        if (! Auth::guard('web')->check()) {
            return;
        }

        $gateway = $request->session()->get('gateway');
        $live = is_array($gateway) && is_string($gateway['sid'] ?? null) && is_string($gateway['sub'] ?? null)
            ? $this->gateway->isLive($gateway['sid'], $gateway['sub'])
            : false;

        if ($live === null) {
            // The gateway can't be asked: stay open only while its last good answer is recent.
            $live = now()->getTimestamp() - (int) ($gateway['checked_at'] ?? 0) <= self::BACKSTOP_SECONDS;
        } elseif ($live) {
            $request->session()->put('gateway.checked_at', now()->getTimestamp());
        }

        if ($live) {
            return;
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
