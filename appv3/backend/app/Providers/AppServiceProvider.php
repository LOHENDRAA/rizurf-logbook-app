<?php

namespace App\Providers;

use App\Models\Placement;
use App\Models\Week;
use App\Policies\PlacementPolicy;
use App\Policies\WeekPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Week::class, WeekPolicy::class);
        Gate::policy(Placement::class, PlacementPolicy::class);

        RateLimiter::for('login', function (Request $request): Limit {
            $key = Str::lower(trim((string) $request->input('email'))).'|'.$request->ip();

            return Limit::perMinute((int) config('portal.login_rate_per_minute', 10))->by($key);
        });

        RateLimiter::for('portal-api', function (Request $request): Limit {
            $user = $request->user();
            $key = ($user?->getAuthIdentifier() ?? $request->ip()).'|'.$request->ip();

            return Limit::perMinute((int) config('portal.api_rate_per_minute', 120))->by($key);
        });
    }
}
