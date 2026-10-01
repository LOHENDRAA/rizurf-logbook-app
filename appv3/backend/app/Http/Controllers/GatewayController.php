<?php

namespace App\Http\Controllers;

use App\Http\Resources\PortalResources;
use App\Models\User;
use App\Models\Week;
use App\Services\CapabilityService;
use App\Services\Gateway;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
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

    /**
     * The counts on the logbook's icon in the gateway's Your apps (MICROAPP_BADGES.md): weeks waiting for each
     * supervisor at their company, and weeks sent back to each intern. Only people with something are listed.
     */
    public function badges(Request $request): JsonResponse
    {
        $this->gateway->verifyBadgeReader((string) $request->bearerToken());

        $waiting = DB::table('users')
            ->join('placements', 'placements.company_id', '=', 'users.company_id')
            ->join('weeks', 'weeks.placement_id', '=', 'placements.id')
            ->where('users.role', User::ROLE_SUPERVISOR)
            ->where('weeks.status', Week::STATUS_SUBMITTED)
            ->where('weeks.company_status', Week::REVIEW_PENDING)
            ->groupBy('users.email')
            ->select('users.email', DB::raw('COUNT(*) AS count'));
        $sentBack = DB::table('weeks')
            ->join('placements', 'placements.id', '=', 'weeks.placement_id')
            ->join('users', 'users.id', '=', 'placements.student_id')
            ->where('weeks.company_status', Week::REVIEW_CHANGES)
            ->groupBy('users.email')
            ->select('users.email', DB::raw('COUNT(*) AS count'));

        return response()->json(['badges' => $waiting->unionAll($sentBack)->limit(5000)->get()
            ->map(fn (object $row): array => ['email' => (string) $row->email, 'count' => (int) $row->count])
            ->all()]);
    }
}
