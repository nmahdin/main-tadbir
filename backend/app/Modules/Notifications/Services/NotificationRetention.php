<?php

namespace App\Modules\Notifications\Services;

use App\Models\DomainRecord;
use Illuminate\Support\Facades\DB;

/**
 * UX-02-4 retention: inbox rows older than 90 days leave the active
 * inbox. Read rows are deleted; unread ordinary rows are archived
 * first, then deleted. Mandatory/security rows are exempt (their
 * lifecycle belongs to SYS-MSG-01/OPS policy, not this command).
 * Chunked and idempotent — safe from the scheduler tick or by hand.
 */
final class NotificationRetention
{
    public const RETENTION_DAYS = 90;

    /** @return array{deleted: int, archived: int, exempt: int, dry_run: bool} */
    public function run(bool $dryRun = false): array
    {
        $cutoff = now()->subDays(self::RETENTION_DAYS);
        $stats = ['deleted' => 0, 'archived' => 0, 'exempt' => 0, 'dry_run' => $dryRun];

        DomainRecord::query()
            ->where('domain', DomainRecord::DOMAIN_NOTIFICATION)
            ->where('created_at', '<', $cutoff)
            ->orderBy('id')
            ->chunkById(1000, function ($rows) use (&$stats, $dryRun) {
                foreach ($rows as $row) {
                    $payload = is_array($row->payload) ? $row->payload : [];
                    $category = $row->category_key ?: NotificationInbox::categoryOfPayload($payload);
                    if (NotificationInbox::isExempt($payload, $category)) {
                        $stats['exempt']++;
                        continue;
                    }

                    $isRead = ! empty($payload['read']);
                    if ($dryRun) {
                        $stats[$isRead ? 'deleted' : 'archived']++;
                        continue;
                    }
                    DB::transaction(function () use ($row, $payload, $isRead, &$stats) {
                        if (! $isRead) {
                            DB::table('notification_archives')->insert([
                                'user_id' => $row->user_id,
                                'notification_key' => $row->notification_key,
                                'payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                                'original_created_at' => $row->created_at,
                                'archived_at' => now(),
                            ]);
                            $stats['archived']++;
                        } else {
                            $stats['deleted']++;
                        }
                        $row->delete();
                    });
                }
            });

        return $stats;
    }
}
