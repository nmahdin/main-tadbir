<?php

namespace App\Bot\Bale\Support;

use App\Services\Organization\DepartmentConsolidation;
use Illuminate\Support\Facades\Schema;

final class OperationsSchema
{
    public const MESSAGE = 'نصب دیتابیس بله کامل نیست. مدیر سامانه باید پس از پشتیبان‌گیری، فایل docs/deployment/bale-operations-repair.mysql.sql را در phpMyAdmin بررسی و اجرا کند.';

    public function missing(?array $only = null): array
    {
        $missing = [];
        foreach (['bale_reminder_runs', 'dam_data_table_department'] as $table) {
            if (($only === null || in_array($table, $only, true)) && ! Schema::hasTable($table)) {
                $missing[] = $table;
            }
        }
        foreach (['bale_user_links' => 'notifications_enabled', 'domain_records' => 'notification_key'] as $table => $column) {
            if (($only === null || in_array($table.'.'.$column, $only, true)) && ! Schema::hasColumn($table, $column)) {
                $missing[] = $table.'.'.$column;
            }
        }

        return $missing;
    }

    public function require(string $feature): void
    {
        if ($feature === 'assets') {
            app(DepartmentConsolidation::class)->requireReady();
        }
        $needed = match ($feature) {
            'reminders' => ['bale_reminder_runs', 'bale_user_links.notifications_enabled', 'domain_records.notification_key'],
            'assets' => ['dam_data_table_department'],
            default => ['bale_user_links.notifications_enabled', 'domain_records.notification_key'],
        };
        abort_if($this->missing($needed) !== [], 503, self::MESSAGE);
    }
}
