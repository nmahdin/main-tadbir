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

// C5-EXT-01 M1: publish the canonical Free plans (idempotent).
// Run explicitly by platform operations; --dry-run only reports.
Artisan::command('plans:provision-free {--dry-run}', function (): int {
    $plans = app(\App\Core\Plans\PlanProvisioner::class);
    $dry = (bool) $this->option('dry-run');
    $grace = (int) config('billing.free.grace_days', 7);
    $entitle = collect(\App\Core\Modules\ModuleCatalog::definitions())
        ->filter(fn ($definition) => $definition->availability->isAvailable())
        ->map(fn ($definition) => $definition->key)
        ->all();
    $specs = [
        ['key' => (string) config('billing.free.personal_plan_key', 'personal-free'), 'version' => (int) config('billing.free.personal_plan_version', 1),
            'name' => 'اشتراک رایگان شخصی', 'audience' => 'personal',
            'limits' => ['workspaces' => 1, 'workspace_members' => 1, 'projects' => 3, 'storage_bytes' => 104857600]],
        ['key' => (string) config('billing.free.organization_plan_key', 'organization-free'), 'version' => (int) config('billing.free.organization_plan_version', 1),
            'name' => 'اشتراک رایگان سازمانی', 'audience' => 'organization',
            'limits' => ['workspaces' => 1, 'organization_members' => 3, 'workspace_members' => 3, 'projects' => 5, 'storage_bytes' => 104857600]],
    ];
    foreach ($specs as $spec) {
        $existing = \App\Core\Plans\CorePlan::query()->where('key', $spec['key'])->first();
        $versionModel = $existing?->versions()->where('version', $spec['version'])->first();
        if ($versionModel !== null && $versionModel->isPublished()) {
            $snapshot = $plans->snapshot($spec['key'], $spec['version']);
            $drift = [];
            foreach ($spec['limits'] as $resource => $expected) {
                $actual = $snapshot->limits[$resource]['limit_value'] ?? null;
                if ($actual !== $expected) {
                    $drift[] = $resource;
                }
            }
            if ($drift !== []) {
                $this->error("{$spec['key']} v{$spec['version']} is published with different limits (".implode(', ', $drift).'); publish a NEW version instead of editing.');

                return 1;
            }
            $this->line("{$spec['key']} v{$spec['version']}: already published (idempotent no-op).");
            continue;
        }
        if ($dry) {
            $this->line("{$spec['key']} v{$spec['version']}: would publish (grace {$grace}d, limits ".json_encode($spec['limits']).', modules '.implode(',', $entitle).').');
            continue;
        }
        app(\App\Core\Modules\ModuleRegistrySynchronizer::class)->sync();
        $plans->createPlan($spec['key'], $spec['name'], $spec['audience']);
        $plans->createDraftVersion($spec['key'], $spec['version'], $grace);
        foreach ($spec['limits'] as $resource => $value) {
            $plans->setLimit($spec['key'], $spec['version'], $resource, $value);
        }
        foreach ($entitle as $moduleKey) {
            $plans->setModuleEntitlement($spec['key'], $spec['version'], $moduleKey, true);
        }
        $plans->publish($spec['key'], $spec['version']);
        $plan = \App\Core\Plans\CorePlan::query()->where('key', $spec['key'])->first();
        if ($plan !== null && $plan->status === \App\Core\Plans\CorePlan::STATUS_DRAFT) {
            $plans->setPlanStatus($spec['key'], \App\Core\Plans\CorePlan::STATUS_ACTIVE);
        }
        $this->line("{$spec['key']} v{$spec['version']}: published.");
    }

    return 0;
})->purpose('Publish the canonical Personal/Organization Free plans (C5-EXT-01 M1)');

// C5-EXT-01 M1: complete pending Free activations (recoverable
// pending state) + scan personal workspaces lacking a subscription.
// Never overwrites an existing legitimate subscription; legacy
// organizations without a pending record are NOT mass-assigned.
Artisan::command('subscriptions:resume-pending-free {--dry-run}', function (): int {
    $activator = app(\App\Core\Subscriptions\FreePlanActivator::class);
    $dry = (bool) $this->option('dry-run');
    $counts = ['activated' => 0, 'existing' => 0, 'pending' => 0, 'conflict' => 0, 'invalid' => 0];

    // (a) Personal scan: active users with a personal workspace but
    // no subscription (covers pre-M1 `pending_plan` accounts; the
    // activation gate no longer depends on the provisioned stamp).
    \App\Models\User::query()->where('status', 'active')->orderBy('id')->chunkById(200, function ($users) use ($activator, $dry, &$counts): void {
        foreach ($users as $user) {
            $workspace = \App\Core\Workspaces\Workspace::personal()->where('owner_user_id', $user->id)->where('is_default', true)->first();
            if ($workspace === null || $activator->subscriptionForPersonalWorkspace($workspace) !== null) {
                continue;
            }
            $counts[$dry ? 'pending' : $activator->activateForPersonalWorkspace($user, $workspace, 'auth-activation-'.$user->id)]++;
        }
    });

    // (b) Recorded pending rows (incl. organizations created while
    // the plan was unpublished).
    \App\Core\Subscriptions\FreeActivationPending::query()->whereNull('resolved_at')->orderBy('id')->chunkById(200, function ($rows) use ($activator, $dry, &$counts): void {
        foreach ($rows as $row) {
            if ($dry) {
                $counts['pending']++;
                continue;
            }
            $result = \App\Core\Subscriptions\FreePlanActivator::INVALID;
            if ($row->organization_id !== null) {
                $organization = \App\Core\Organizations\Organization::find($row->organization_id);
                $creator = $row->user_id !== null ? \App\Models\User::find($row->user_id) : null;
                if ($organization !== null && $creator !== null) {
                    $result = $activator->activateForOrganization($creator, $organization, 'org-creation-'.$organization->id);
                }
            } elseif ($row->personal_workspace_id !== null) {
                $workspace = \App\Core\Workspaces\Workspace::find($row->personal_workspace_id);
                $user = $row->user_id !== null ? \App\Models\User::find($row->user_id) : null;
                if ($workspace !== null && $user !== null) {
                    $result = $activator->activateForPersonalWorkspace($user, $workspace, 'auth-activation-'.$user->id);
                }
            }
            $counts[$result] = ($counts[$result] ?? 0) + 1;
        }
    });

    $this->line(sprintf(
        'resume-pending-free%s: activated=%d existing=%d pending=%d conflict=%d invalid=%d',
        $dry ? ' (dry-run)' : '',
        $counts['activated'], $counts['existing'], $counts['pending'], $counts['conflict'], $counts['invalid'],
    ));

    return 0;
})->purpose('Complete pending Free-plan activations (C5-EXT-01 M1)');
