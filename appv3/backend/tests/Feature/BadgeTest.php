<?php

namespace Tests\Feature;

use App\Models\Placement;
use App\Models\User;
use App\Models\Week;
use App\Services\WeekService;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class BadgeTest extends TestCase
{
    /**
     * An access token the gateway signs for reading badges (MICROAPP_BADGES.md §2). No person in it.
     *
     * @param  array<string, mixed>  $claims
     */
    private function badgeToken(array $claims = [], ?string $privateKey = null): string
    {
        return $this->identityToken([
            'token_use' => 'access',
            'scope' => 'gateway:badges:read',
            'sub' => 'gateway',
            'sid' => null,
            'email' => null,
            'name' => null,
            'role' => null,
            ...$claims,
        ], $privateKey);
    }

    private function readBadges(?string $token): TestResponse
    {
        return $this->flushHeaders()->getJson('/api/v1/gateway/badges', $token === null ? [] : ['Authorization' => "Bearer {$token}"]);
    }

    /**
     * @return array<string, int>
     */
    private function counts(TestResponse $response): array
    {
        $counts = [];
        foreach ($response->assertOk()->json('badges') as $badge) {
            $counts[$badge['email']] = $badge['count'];
        }
        ksort($counts);

        return $counts;
    }

    private function seededWeek(int $number): Week
    {
        return Week::query()->where('placement_id', 'placement-a')->where('week_number', $number)->firstOrFail();
    }

    public function test_the_gateway_reads_waiting_and_sent_back_weeks_per_person(): void
    {
        // Seeded: Aisha's week 1 waits for review at Nusantara, her week 3 was sent back, week 2 is a draft.
        $response = $this->readBadges($this->badgeToken());

        $this->assertSame([
            'aisha.rahman@student.example.edu' => 1,
            'sarah.lim@nusantara.example.com' => 1,
        ], $this->counts($response));
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertGuest();
    }

    public function test_supervisors_count_only_their_own_company(): void
    {
        User::query()->create(['id' => 'supervisor-2', 'name' => 'Ravi Kumar', 'email' => 'ravi.kumar@nusantara.example.com', 'role' => User::ROLE_SUPERVISOR, 'company_id' => 'company-nusantara']);
        // Daniel's company (Merlion) has no supervisor: his waiting week counts for nobody.
        $this->app->make(WeekService::class)->ensureWeeks(Placement::query()->findOrFail('placement-b'));
        Week::query()->where('placement_id', 'placement-b')->where('week_number', 1)
            ->update(['status' => Week::STATUS_SUBMITTED, 'company_status' => Week::REVIEW_PENDING]);

        $this->assertSame([
            'aisha.rahman@student.example.edu' => 1,
            'ravi.kumar@nusantara.example.com' => 1,
            'sarah.lim@nusantara.example.com' => 1,
        ], $this->counts($this->readBadges($this->badgeToken())));
    }

    public function test_a_resubmitted_week_moves_from_the_intern_to_the_supervisor(): void
    {
        $this->seededWeek(3)->update(['status' => Week::STATUS_SUBMITTED, 'company_status' => Week::REVIEW_PENDING]);
        $this->seededWeek(1)->update(['company_status' => Week::REVIEW_APPROVED]);
        $this->seededWeek(2)->update(['status' => Week::STATUS_SUBMITTED, 'company_status' => Week::REVIEW_PENDING]);

        $this->assertSame(['sarah.lim@nusantara.example.com' => 2], $this->counts($this->readBadges($this->badgeToken())));
    }

    /**
     * @return array<string, array{0: string|null}>
     */
    public static function wrongTokens(): array
    {
        return [
            'no token' => [null],
            'not a token' => ['not-a-token'],
            'the sign-in token' => ['identity'],
            'for another service' => ['other-service'],
            'without the badge scope' => ['no-scope'],
            'signed by another key' => ['other-key'],
        ];
    }

    #[DataProvider('wrongTokens')]
    public function test_only_the_gateways_badge_token_reads_counts(?string $kind): void
    {
        $token = match ($kind) {
            'identity' => $this->identityToken(),
            'other-service' => $this->badgeToken(['aud' => 'payments-api']),
            'no-scope' => $this->badgeToken(['scope' => 'gateway:apps:read']),
            'other-key' => $this->badgeToken([], self::newRsaKey()['private']),
            default => $kind,
        };

        $this->readBadges($token)
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'UNAUTHORIZED')
            ->assertJsonMissingPath('badges');
    }
}
