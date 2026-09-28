<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * پوشه‌بندی و دسته‌بندی جدول‌های اطلاعات + اتصال ردیف به محتوای خاص.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('dam_data_tables', function (Blueprint $t) {
            $t->string('folder', 120)->nullable()->after('description');
            $t->string('category', 120)->nullable()->after('folder');
            $t->index('folder');
            $t->index('category');
        });

        Schema::table('dam_data_rows', function (Blueprint $t) {
            $t->foreignId('content_id')->nullable()->after('task_id')->constrained('contents')->nullOnDelete();
            $t->index('content_id');
        });
    }

    public function down(): void
    {
        Schema::table('dam_data_rows', function (Blueprint $t) {
            $t->dropConstrainedForeignId('content_id');
        });
        Schema::table('dam_data_tables', function (Blueprint $t) {
            $t->dropIndex(['folder']);
            $t->dropIndex(['category']);
            $t->dropColumn(['folder', 'category']);
        });
    }
};
