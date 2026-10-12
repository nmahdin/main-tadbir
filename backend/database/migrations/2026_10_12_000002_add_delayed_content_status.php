<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the derived `delayed` content status («در تأخیر») to organisation settings.
 *
 * The status itself is produced by ContentStageTaskSync: as soon as an unfinished
 * stage is past its own deadline, the content becomes `delayed`; finishing the
 * stage (or extending the deadline) removes it again. Because it is derived, it
 * must never appear as a manually selectable option — but it does need a settings
 * row, otherwise the badge would fall back to a generic label and colour instead
 * of the violet tone used for the stage deadline chip.
 *
 * Existing contents are not rewritten here: `contents:refresh-deadline-status`
 * (bounded, idempotent, resumable) and the ordinary list/detail traffic refresh
 * the derived status without a migration touching workflow data.
 */
return new class extends Migration
{
    private const DELAYED = 'delayed';

    public function up(): void
    {
        if (! Schema::hasTable('system_settings')) {
            return;
        }

        $setting = DB::table('system_settings')->where('key', 'content_statuses')->first();
        if (! $setting) {
            return;
        }

        $statuses = json_decode($setting->value ?: '[]', true);
        if (! is_array($statuses) || $statuses === []) {
            return;
        }

        foreach ($statuses as $status) {
            if (is_array($status) && ($status['id'] ?? null) === self::DELAYED) {
                return;
            }
        }

        // Sits right after «نیازمند اصلاح» so the list keeps its workflow order.
        $insertAt = count($statuses);
        foreach ($statuses as $index => $status) {
            if (is_array($status) && ($status['id'] ?? null) === 'revising') {
                $insertAt = $index + 1;
                break;
            }
        }

        $entry = ['id' => self::DELAYED, 'label' => 'در تأخیر', 'color' => '#7c3aed'];
        array_splice($statuses, $insertAt, 0, [$entry]);

        foreach ($statuses as $index => &$status) {
            if (is_array($status)) {
                $status['order'] = $index + 1;
            }
        }
        unset($status);

        DB::table('system_settings')->where('id', $setting->id)->update([
            'value' => json_encode(array_values($statuses), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // «تأخیر» وضعیتی مشتق است؛ حذف ردیف تنظیمات آن فقط رنگ نشانگر را از بین
        // میبرد و وضعیت را غیرقابل‌ساخت نمی‌کند، بنابراین بازگردانی لازم نیست.
    }
};
