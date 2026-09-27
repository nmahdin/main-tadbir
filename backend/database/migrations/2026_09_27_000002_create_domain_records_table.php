<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * جدول عمومی رکوردهای دامنه‌محور برای ماژول‌های سبک سامانه.
 *
 * دامنه‌های تعریف‌شده:
 *   notification  → اعلان‌های کاربران
 *   asset_folder  → پوشه‌های مدیریت دارایی‌های دیجیتال (DAM)
 *   asset         → فایل‌ها و دارایی‌های دیجیتال
 *   conversation  → گفتگوهای چت داخلی
 *   chat_message  → پیام‌های چت (parent_id = شناسه گفتگو)
 *
 * ساختار هر رکورد در ستون payload (JSON) نگهداری می‌شود؛ مشابه
 * الگوی جدول‌های contents و workspace_records.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('domain_records', function (Blueprint $table) {
            $table->id();
            $table->string('domain', 40);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('parent_id')->nullable()->index();
            $table->string('title')->nullable();
            $table->string('status', 80)->nullable();
            $table->json('payload');
            $table->timestamps();

            $table->index(['domain', 'created_at']);
            $table->index(['domain', 'user_id']);
            $table->index(['domain', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domain_records');
    }
};
