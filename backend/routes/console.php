<?php

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\PollingRunner;
use App\Bot\Bale\Settings;
use App\Bot\Bale\Support\RuntimeLock;
use App\Services\OverdueNotifications;
use App\Support\Content\ContentCodeAllocator;
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
