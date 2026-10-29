<?php

namespace App\Console\Commands;

use App\Core\Platform\Operations\OperationTokenSigner;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Operator-side token issuance (Stage C2-4). Run wherever the
 * infrastructure operator holds PLATFORM_OPERATIONS_SECRET (their
 * own workstation or a controlled shell) — never exposes the
 * secret; prints only the single-use signed token.
 */
final class IssuePlatformOperationToken extends Command
{
    protected $signature = 'platform:operations:issue
        {--operation= : bootstrap or recovery}
        {--target= : Target username (existing user)}
        {--operator= : Independently established operator identifier}
        {--request-id= : Unique request ID (generated when omitted)}
        {--ttl=900 : Validity window in seconds (max: platform.operations.max_ttl_seconds)}
        {--incident-id= : Incident ID (recovery)}
        {--reason= : Incident reason (recovery)}
        {--evidence=* : Evidence reference (recovery, repeatable)}
        {--verification-method= : Independent verification method (recovery)}
        {--verification-reference= : Independent verification reference (recovery)}';

    protected $description = 'Issue a signed, single-use platform bootstrap/recovery operation token';

    public function handle(): int
    {
        $secret = config('platform.operations.secret');
        if (! is_string($secret) || $secret === '') {
            $this->error('PLATFORM_OPERATIONS_SECRET is not configured; refusing to issue.');

            return self::FAILURE;
        }

        $operation = (string) $this->option('operation');
        $target = (string) $this->option('target');
        $operator = (string) $this->option('operator');
        if (! in_array($operation, ['bootstrap', 'recovery'], true) || $target === '' || $operator === '') {
            $this->error('--operation (bootstrap|recovery), --target and --operator are required.');

            return self::FAILURE;
        }

        $now = time();
        $payload = [
            'op' => $operation,
            'request_id' => (string) ($this->option('request-id') ?: Str::uuid()),
            'operator' => $operator,
            'target_username' => $target,
            'iat' => $now,
            'exp' => $now + max(60, (int) $this->option('ttl')),
        ];

        if ($operation === 'recovery') {
            $payload['incident'] = array_filter([
                'id' => $this->option('incident-id'),
                'reason' => $this->option('reason'),
                'evidence' => $this->option('evidence'),
                'verification' => array_filter([
                    'method' => $this->option('verification-method'),
                    'reference' => $this->option('verification-reference'),
                ]),
            ]);
        }

        $this->line(OperationTokenSigner::sign($payload, $secret));

        return self::SUCCESS;
    }
}
