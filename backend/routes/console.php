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
