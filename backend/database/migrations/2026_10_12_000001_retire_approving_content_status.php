<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Retires the `approving` content status.
 *
 * A stage waiting for its reviewer is already reported as `reviewing` by
 * ContentStageTaskSync, so `approving` could never be produced by the workflow:
 * it survived only as an unreachable kanban column and as a dropdown entry that
 * the server silently overwrote on the next synchronisation. Existing rows are
 * mapped to `reviewing`; the option is removed from organisation settings so the
 * list of statuses matches the statuses the workflow can actually produce.
 */
return new class extends Migration
{
    private const RETIRED = 'approving';

    private const REPLACEMENT = 'reviewing';

    public function up(): void
    {
        if (Schema::hasTable('contents')) {
            DB::table('contents')->where('status', self::RETIRED)
                ->orderBy('id')->chunkById(200, function ($contents): void {
                    foreach ($contents as $content) {
                        $payload = json_decode($content->payload ?: '{}', true);
                        if (is_array($payload) && ($payload['status'] ?? null) === self::RETIRED) {
                            $payload['status'] = self::REPLACEMENT;
                        }
                        DB::table('contents')->where('id', $content->id)->update([
                            'status' => self::REPLACEMENT,
                            'payload' => json_encode(is_array($payload) ? $payload : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        ]);
                    }
                });
        }

        if (! Schema::hasTable('system_settings')) {
            return;
        }

        $setting = DB::table('system_settings')->where('key', 'content_statuses')->first();
        if (! $setting) {
            return;
        }

        $statuses = json_decode($setting->value ?: '[]', true);
        if (! is_array($statuses)) {
            return;
        }

        $kept = array_values(array_filter(
            $statuses,
            fn ($status) => is_array($status) && ($status['id'] ?? null) !== self::RETIRED,
        ));
        if (count($kept) === count($statuses)) {
            return;
        }

        // A settings list must never end up empty: fall back to the workflow statuses.
        if ($kept === []) {
            $kept = [
                ['id' => 'idea', 'label' => 'ایده اولیه', 'color' => '#64748b'],
                ['id' => 'planning', 'label' => 'برنامهریزی', 'color' => '#3b82f6'],
                ['id' => 'producing', 'label' => 'در حال تولید', 'color' => '#f59e0b'],
                ['id' => 'reviewing', 'label' => 'در انتظار بازبینی', 'color' => '#8b5cf6'],
                ['id' => 'revising', 'label' => 'نیازمند اصلاح', 'color' => '#f43f5e'],
                ['id' => 'ready_to_publish', 'label' => 'آماده انتشار', 'color' => '#14b8a6'],
                ['id' => 'published', 'label' => 'منتشرشده', 'color' => '#22c55e'],
            ];
        }

        foreach ($kept as $index => &$status) {
            $status['order'] = $index + 1;
        }
        unset($status);

        DB::table('system_settings')->where('id', $setting->id)->update([
            'value' => json_encode($kept, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // The retired status stays retired: the workflow cannot produce it, so
        // restoring the option would only recreate an unreachable column.
    }
};
