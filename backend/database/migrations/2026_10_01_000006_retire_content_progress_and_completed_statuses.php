<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('contents')) {
            if (Schema::hasColumn('contents', 'previous_status')) {
                DB::table('contents')->where('previous_status', 'in_progress')->update(['previous_status' => 'producing']);
                DB::table('contents')->where('previous_status', 'completed')->update(['previous_status' => 'approved']);
            }
            DB::table('contents')->whereIn('status', ['in_progress', 'completed'])
                ->orderBy('id')->chunkById(200, function ($contents): void {
                    foreach ($contents as $content) {
                        $status = $content->status === 'completed' ? 'approved' : 'producing';
                        $payload = json_decode($content->payload ?: '{}', true);
                        if (is_array($payload) && isset($payload['status'])) {
                            $payload['status'] = $status;
                        }
                        DB::table('contents')->where('id', $content->id)->update([
                            'status' => $status,
                            'payload' => json_encode(is_array($payload) ? $payload : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        ]);
                    }
                });
        }

        if (Schema::hasTable('system_settings')) {
            $setting = DB::table('system_settings')->where('key', 'content_statuses')->first();
            if ($setting) {
                $statuses = json_decode($setting->value ?: '[]', true);
                if (is_array($statuses)) {
                    $statuses = array_values(array_filter($statuses, fn ($status) => is_array($status) && ! in_array($status['id'] ?? null, ['in_progress', 'completed'], true)));
                    foreach ($statuses as $index => &$status) {
                        $status['order'] = $index + 1;
                    }
                    unset($status);
                    DB::table('system_settings')->where('id', $setting->id)->update([
                        'value' => json_encode($statuses, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        // Retired workflow statuses are intentionally not recreated. The data mapping is lossless enough for rollback.
    }
};
