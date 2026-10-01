<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class UserCommandTest extends TestCase
{
    public function test_adds_a_supervisor_to_a_new_company(): void
    {
        $this->artisan('logbook:user', ['email' => 'New.Person@Acme.com', 'name' => 'New Person', 'role' => 'supervisor', '--company' => 'Acme'])
            ->assertSuccessful();

        $user = User::query()->where('email', 'new.person@acme.com')->firstOrFail();
        $this->assertSame('supervisor', $user->role);
        $this->assertSame('New Person', $user->name);
        $this->assertSame('Acme', $user->company?->name);
    }

    public function test_updates_an_existing_person_matched_by_email_in_any_case(): void
    {
        $this->artisan('logbook:user', ['email' => 'AISHA.RAHMAN@student.example.edu', 'name' => 'Aisha Rahman', 'role' => 'supervisor', '--company' => 'Nusantara Digital'])
            ->assertSuccessful();

        $this->assertSame('supervisor', $this->user('student-1')->role);
        $this->assertSame(1, User::query()->whereRaw('LOWER(email) = ?', ['aisha.rahman@student.example.edu'])->count());
    }

    public function test_rejects_an_unknown_role(): void
    {
        $this->artisan('logbook:user', ['email' => 'x@acme.com', 'name' => 'X', 'role' => 'admin', '--company' => 'Acme'])
            ->assertFailed();
        $this->assertNull(User::query()->where('email', 'x@acme.com')->first());
    }

    public function test_asks_which_company_when_there_is_more_than_one(): void
    {
        // The seed has two companies (Nusantara Digital and Merlion Systems).
        $this->artisan('logbook:user', ['email' => 'x@acme.com', 'name' => 'X', 'role' => 'student'])
            ->expectsOutputToContain('--company')
            ->assertFailed();
    }
}
