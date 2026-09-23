<?php

namespace App\Console\Commands;

use App\Services\IdempotencyService;
use Illuminate\Console\Command;

final class PruneIdempotencyKeys extends Command
{
    protected $signature = 'idempotency:prune';

    protected $description = 'Delete expired idempotency records.';

    public function handle(IdempotencyService $idempotency): int
    {
        $deleted = $idempotency->prune();

        $this->info("Pruned {$deleted} expired idempotency record(s).");

        return self::SUCCESS;
    }
}
