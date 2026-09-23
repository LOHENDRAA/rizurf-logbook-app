<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Resources\PortalResources;
use App\Models\User;
use App\Services\CapabilityService;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

final class AuthController extends Controller
{
    public function __construct(private readonly CapabilityService $capabilities) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $email = strtolower(trim((string) $request->input('email')));

        /** @var User|null $user */
        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

        if ($user === null || ! Hash::check((string) $request->input('password'), $user->password)) {
            Problem::throw(
                Response::HTTP_UNAUTHORIZED,
                'UNAUTHENTICATED',
                'Email or password is incorrect.'
            );
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json(
            PortalResources::sessionUser($user, $this->capabilities->forSession($user))
        );
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
