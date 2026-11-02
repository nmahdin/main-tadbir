<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ایندکس‌های گزارش‌ها و فهرست‌های کاری.
 *
 * تا پیش از این هیچ ایندکس ثانویه‌ای روی «وضعیت»، «نوع» و «سررسید» نبود و هر
 * بارگذاری فهرست یا گزارش، جدول کامل را می‌خواند (گزارش‌ها ۹ تجمیع و چند
 * شمارش روی همین جدول‌ها اجرا می‌کنند). این ایندکس‌ها همان الگوهای واقعی
 * کوئری را پوشش می‌دهند و به داده یا ستون تازه‌ای نیاز ندارند.
 *
 * توجه: فیلترهای داخل ستون JSON (`payload->…`) با ایندکس معمولی پوشش داده
 * نمی‌شوند؛ راه‌حل آن‌ها ستون تولیدشده است و در سند بهینه‌سازی جدا آمده است.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contents', function (Blueprint $table): void {
            $table->index(['status', 'deadline'], 'contents_status_deadline_index');
            $table->index(['type', 'status'], 'contents_type_status_index');
            $table->index('deadline', 'contents_deadline_index');
        });

        Schema::table('tasks', function (Blueprint $table): void {
            $table->index(['status', 'deadline'], 'tasks_status_deadline_index');
            $table->index(['assignee_id', 'status'], 'tasks_assignee_status_index');
            $table->index(['project_id', 'status'], 'tasks_project_status_index');
            $table->index('deadline', 'tasks_deadline_index');
        });

        Schema::table('workspace_records', function (Blueprint $table): void {
            // ایده‌ها و جلسات با همین دو ستون فیلتر می‌شوند (کارت‌های گزارش).
            $table->index(['kind', 'status'], 'workspace_records_kind_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('workspace_records', function (Blueprint $table): void {
            $table->dropIndex('workspace_records_kind_status_index');
        });

        Schema::table('tasks', function (Blueprint $table): void {
            $table->dropIndex('tasks_deadline_index');
            $table->dropIndex('tasks_project_status_index');
            $table->dropIndex('tasks_assignee_status_index');
            $table->dropIndex('tasks_status_deadline_index');
        });

        Schema::table('contents', function (Blueprint $table): void {
            $table->dropIndex('contents_deadline_index');
            $table->dropIndex('contents_type_status_index');
            $table->dropIndex('contents_status_deadline_index');
        });
    }
};
