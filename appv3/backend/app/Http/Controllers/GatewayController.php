<?php

namespace App\Http\Controllers;

use App\Http\Resources\PortalResources;
use App\Models\User;
use App\Services\CapabilityService;
use App\Services\Gateway;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sign-in through the Rizurf gateway (MICROAPP_AUTH.md §4). There is no password and no sign-out here:
 * the gateway is the only place for either.
 */
final class GatewayController extends Controller
{
    public function __construct(
        private readonly Gateway $gateway,
        private readonly CapabilityService $capabilities,
    ) {}

    public function start(): RedirectResponse
    {
        return redirect()->away($this->gateway->authorizeUrl());
    }

    public function finish(Request $request): JsonResponse
    {
        $code = (string) $request->validate(['code' => ['required', 'string', 'max:2048']])['code'];
        $identity = $this->gateway->exchange($code);

        // The role comes from the logbook's own users table (SS-24), never from the gateway's claim.
        /** @var User|null $user */
        $user = User::query()->whereRaw('LOWER(email) = ?', [strtolower($identity['email'])])->first();
        if ($user === null) {
            Problem::throw(Response::HTTP_FORBIDDEN, 'FORBIDDEN', "{$identity['email']} isn't set up in the logbook yet. Ask the logbook admin to add you.");
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('gateway', [
            'sid' => $identity['sid'],
            'sub' => $identity['sub'],
            'checked_at' => now()->getTimestamp(),
        ]);

        return response()->json(PortalResources::sessionUser($user, $this->capabilities->forSession($user)));
    }
}
