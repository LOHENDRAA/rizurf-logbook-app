<?php

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Str;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('idempotency:prune')->daily();

Artisan::command(
    'logbook:user {email} {name} {role : student or supervisor} {--company= : The company name; created if new. Defaults to the only company}',
    function (string $email, string $name, string $role): int {
        if (! in_array($role, User::ROLES, true)) {
            $this->error('The role must be student or supervisor.');

            return 1;
        }

        $companyName = trim((string) $this->option('company'));
        if ($companyName !== '') {
            $company = Company::query()->firstOrCreate(['name' => $companyName], ['id' => (string) Str::uuid()]);
        } else {
            $companies = Company::query()->limit(2)->get();
            if ($companies->count() !== 1) {
                $this->error('Say which company with --company="Company name".');

                return 1;
            }
            $company = $companies->first();
        }

        $email = strtolower(trim($email));
        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first()
            ?? new User(['id' => (string) Str::uuid(), 'email' => $email]);
        $user->fill(['name' => $name, 'role' => $role, 'company_id' => $company->id])->save();

        $this->info("{$email} can now sign in through the gateway as a {$role} at {$company->name}.");

        return 0;
    }
)->purpose('Add or update someone who may use the logbook (they sign in through the Rizurf gateway)');
