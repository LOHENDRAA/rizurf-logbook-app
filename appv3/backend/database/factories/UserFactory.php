<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'id' => 'user-'.Str::lower(Str::random(8)),
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => User::ROLE_STUDENT,
            'avatar' => null,
            'company_id' => null,
            'remember_token' => Str::random(10),
        ];
    }

    public function student(): static
    {
        return $this->state(fn (array $attributes) => ['role' => User::ROLE_STUDENT]);
    }

    public function supervisor(?string $companyId = null): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_SUPERVISOR,
            'company_id' => $companyId,
        ]);
    }

    public function mentor(): static
    {
        return $this->state(fn (array $attributes) => ['role' => User::ROLE_MENTOR]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
