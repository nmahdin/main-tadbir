<?php

namespace App\Console\Commands;

use App\Core\Platform\Operations\OperationTokenVerifier;
use App\Core\Platform\Operations\PlatformOperationException;
use App\Core\Platform\Operations\PlatformOperationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Processes pending `*.opreq` token files from the operations
 * directory (Stage C2-4) — the cron-friendly execution adapter
 * for shared hosting. The directory must be outside any publicly
 * served path; processed files are moved to `processed/` with a
 * result suffix and are never left pending. Output contains
 * request IDs and result codes only.
 *
 * NOTE: on hosts where PHP CLI via cron is unavailable this
 * adapter simply cannot run; there is intentionally no HTTP
 * fallback (see the operations runbook).
 */
final class ProcessPlatformOperations extends Command
{
    protected $signature = 'platform:operations:process';

    protected $description = 'Execute pending signed platform operation files from the operations directory';

    public function handle(OperationTokenVerifier $verifier, PlatformOperationService $operations): int
    {
        $directory = (string) config('platform.operations.directory');
        if (! is_dir($directory)) {
            $this->warn('Operations directory does not exist; nothing to process.');

            return self::SUCCESS;
        }

        $processedDir = $directory.'/processed';
        File::ensureDirectoryExists($processedDir);

        $files = glob($directory.'/*.opreq') ?: [];
        if ($files === []) {
            $this->line('No pending platform operations.');

            return self::SUCCESS;
        }

        $exit = self::SUCCESS;
        foreach ($files as $file) {
            $token = trim((string) file_get_contents($file));
            $base = basename($file);
            try {
                $verified = $verifier->verify($token);
                $operations->execute($verified);
                rename($file, $processedDir.'/'.$base.'.done');
                $this->info("{$base}: completed (request {$verified->requestId}).");
            } catch (PlatformOperationException $exception) {
                if (isset($verified)) {
                    $operations->recordRejection($verified, $exception->errorCode);
                }
                rename($file, $processedDir.'/'.$base.'.rejected');
                $this->error("{$base}: rejected [{$exception->errorCode}].");
                $exit = self::FAILURE;
            } catch (\Throwable) {
                rename($file, $processedDir.'/'.$base.'.rejected');
                $this->error("{$base}: rejected [operation_failed].");
                $exit = self::FAILURE;
            } finally {
                unset($verified);
            }
        }

        return $exit;
    }
}
