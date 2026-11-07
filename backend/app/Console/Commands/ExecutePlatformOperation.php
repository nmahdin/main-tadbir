<?php

namespace App\Console\Commands;

use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationException;
use App\Core\Platform\Operations\PlatformOperationService;
use Illuminate\Console\Command;

/**
 * Executes one signed platform operation token (Stage C2-4).
 * Suitable for one-shot cron invocation with the token supplied
 * as an argument or from a file inside the operations directory
 * (outside any publicly served path). Output never contains the
 * token or secret material.
 */
final class ExecutePlatformOperation extends Command
{
    protected $signature = 'platform:operations:execute {token? : Signed operation token} {--file= : Read the token from this file}';

    protected $description = 'Verify and execute one signed platform bootstrap/recovery operation';

    public function handle(OperationTokenVerifier $verifier, PlatformOperationService $operations): int
    {
        $token = (string) ($this->argument('token') ?? '');
        if ($token === '' && $this->option('file')) {
            $path = (string) $this->option('file');
            $token = is_file($path) ? trim((string) file_get_contents($path)) : '';
        }
        if ($token === '') {
            $this->error('No operation token supplied.');

            return self::FAILURE;
        }

        try {
            $verified = $verifier->verify($token);
        } catch (PlatformOperationException $exception) {
            $this->error("Operation rejected [{$exception->errorCode}].");

            return self::FAILURE;
        }

        try {
            $assignment = $operations->execute($verified);
        } catch (PlatformOperationException $exception) {
            $operations->recordRejection($verified, $exception->errorCode);
            $this->error("Operation rejected [{$exception->errorCode}]: {$exception->getMessage()}");

            return self::FAILURE;
        }

        $this->info("Operation [{$verified->operation}] completed for user #{$assignment->user_id} (request {$verified->requestId}).");

        return self::SUCCESS;
    }
}
