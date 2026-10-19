<?php

use App\Modules\Messaging\Bot\Bale\Client\BaleApiException;
use App\Modules\Messaging\Bot\Bale\PollingRunner;
use App\Modules\Messaging\Bot\Bale\Settings;
use App\Modules\Messaging\Bot\Bale\Support\RuntimeLock;
use App\Modules\Notifications\Services\OverdueNotifications;
use App\Modules\Contents\Support\ContentCodeAllocator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('bale:tick', function (Settings $settings, RuntimeLock $lock, PollingRunner $runner): int {
    if (! $settings->ready()) {
        $this->line('Bale is not ready; nothing to deliver.');

        return 0;
    }

    try {
        $result = $lock->run(fn () => $runner->tick(true));
        $this->line(sprintf('Bale tick completed: transport=%s received=%d sent=%d.', $result['transport'], $result['received'], $result['sent']));

        return 0;
    } catch (BaleApiException $exception) {
        $this->error('Bale tick failed with safe code: '.$exception->reason);

        return 1;
    } catch (\Throwable) {
        // Console output must not contain a URL capability, token, payload or linking code.
        $this->error('Bale tick failed before completion.');

        return 1;
    }
})->purpose('Drain Bale delivery retries and poll only when webhook transport is inactive');

Schedule::command('bale:tick')
    ->everyMinute()
    ->withoutOverlapping(2);

// Overdue reminders are idempotent, so they may run as often or as rarely as the
// host allows. Nothing below assumes a permanent cron: the command is safe to
// call from the Bale tick above, from an external scheduler, or by hand.
// UX-02-4: 90-day notification retention (archives unread ordinary rows,
// deletes read ones, exempts mandatory/security). Chunked + idempotent.
Artisan::command('notifications:prune-retention {--dry-run}', function (\App\Modules\Notifications\Services\NotificationRetention $retention): int {
    $result = $retention->run((bool) $this->option('dry-run'));
    $this->line(sprintf('Notification retention: deleted=%d archived=%d exempt=%d%s.', $result['deleted'], $result['archived'], $result['exempt'], $result['dry_run'] ? ' (dry-run)' : ''));

    return 0;
})->purpose('Prune inbox notifications older than 90 days (UX-02-4)');

// UX-02-4: backfill read_at/category_key/group_key accelerators for rows
// written before the columns existed. Idempotent, chunked, any-time.
Artisan::command('notifications:backfill-columns', function (): int {
    $filled = 0;
    \App\Models\DomainRecord::query()
        ->where('domain', \App\Models\DomainRecord::DOMAIN_NOTIFICATION)
        ->whereNull('group_key')
        ->orderBy('id')
        ->chunkById(1000, function ($rows) use (&$filled) {
            foreach ($rows as $row) {
                $payload = is_array($row->payload) ? $row->payload : [];
                $category = \App\Modules\Notifications\Services\NotificationInbox::categoryOfPayload($payload);
                $row->forceFill([
                    'category_key' => $category,
                    'group_key' => \App\Modules\Notifications\Services\NotificationInbox::groupKeyOf($payload, $category),
                    'read_at' => ! empty($payload['read']) ? ($row->created_at ?? now()) : null,
                ])->saveQuietly();
                $filled++;
            }
        });
    $this->line(sprintf('Notification columns backfilled: %d.', $filled));

    return 0;
})->purpose('Backfill UX-02-4 notification accelerator columns');

Artisan::command('content:overdue-notifications', function (OverdueNotifications $overdue): int {
    $result = $overdue->run();
    $this->line(sprintf('Overdue reminders: scanned=%d reminders=%d.', $result['scanned'], $result['reminders']));

    return 0;
})->purpose('Create idempotent overdue reminders for tasks and content deadlines');

// Backfill of the stable code for contents created before the column existed.
// It is idempotent, resumable and safe to run from cPanel's cron UI or by hand.
Artisan::command('contents:allocate-codes {--limit=200}', function (ContentCodeAllocator $allocator): int {
    $filled = $allocator->backfillMissing((int) $this->option('limit'));
    $this->line(sprintf('Content codes allocated: %d.', $filled));

    return 0;
})->purpose('Give every content without a code a stable, unique one');

// AUTH-EXT-01 (AMB-06): read-only legacy phone audit. Reports
// duplicates/nulls/unverified values; never mutates data.
Artisan::command('auth:phone-preflight', function (): int {
    $duplicates = DB::table('users')->selectRaw('phone, COUNT(*) as total')
        ->whereNotNull('phone')->where('phone', '!=', '')
        ->groupBy('phone')->having('total', '>', 1)->get();
    $this->line('users='.DB::table('users')->count());
    $this->line('phones_null='.DB::table('users')->whereNull('phone')->count());
    $this->line('phones_unverified='.DB::table('users')->whereNotNull('phone')->whereNull('phone_verified_at')->count());
    $this->line('duplicate_phone_groups='.$duplicates->count());
    foreach ($duplicates as $row) {
        $this->line("duplicate phone={$row->phone} count={$row->total}");
    }

    return 0;
})->purpose('Read-only duplicate/unverified phone audit (AMB-06)');

// AUTH-EXT-01 (AMB-01): read-only username normalization audit.
Artisan::command('auth:username-preflight', function (): int {
    $conflicts = \App\Core\Identity\UsernamePolicy::normalizationConflicts();
    $this->line('normalization_conflict_groups='.count($conflicts));
    foreach ($conflicts as $conflict) {
        $this->line("conflict normalized={$conflict['normalized']} usernames=".implode('|', $conflict['usernames']));
    }

    return 0;
})->purpose('Read-only username normalization conflict audit (AMB-01)');

// AMB-05: finalize deletion requests older than the 14-day grace.
// Personal fields are anonymized; shared/organizational records and
// legally retained data are kept detached (never deleted here).
Artisan::command('accounts:process-deletions', function (): int {
    $processed = 0;
    DB::table('users')
        ->whereNotNull('deletion_requested_at')
        ->where('deletion_requested_at', '<=', now()->subDays(14))
        ->where('status', '!=', 'deleted')
        ->orderBy('id')
        ->chunkById(100, function ($rows) use (&$processed): void {
            foreach ($rows as $row) {
                DB::transaction(function () use ($row, &$processed): void {
                    DB::table('users')->where('id', $row->id)->update([
                        'name' => 'کاربر حذف‌شده',
                        'username' => 'deleted-'.$row->id,
                        'username_normalized' => 'deleted-'.$row->id,
                        'email' => null,
                        'email_verified_at' => null,
                        'phone' => null,
                        'phone_verified_at' => null,
                        'password' => bcrypt(str()->random(48)),
                        'status' => 'deactivated', // terminal status per users.status enum
                        'deletion_requested_at' => null,
                    ]);
                    DB::table('verified_phone_claims')->where('user_id', $row->id)->delete();
                    DB::table('user_external_identities')->where('user_id', $row->id)->delete();
                    DB::table('user_devices')->where('user_id', $row->id)->delete();
                    DB::table('sessions')->where('user_id', $row->id)->delete();
                    DB::table('personal_access_tokens')->where('tokenable_id', $row->id)->where('tokenable_type', \App\Models\User::class)->delete();
                    $processed++;
                });
            }
        });
    $this->line("Deletion requests finalized: {$processed}.");

    return 0;
})->purpose('Finalize account deletions after the 14-day grace (AMB-05)');

// Housekeeping: OTP challenges are short-lived secrets; prune daily.
Artisan::command('auth:prune-otp-challenges', function (): int {
    $deleted = DB::table('auth_otp_challenges')->where('created_at', '<', now()->subDay())->delete();
    $this->line("OTP challenges pruned: {$deleted}.");

    return 0;
})->purpose('Delete OTP challenges older than 24 hours');
