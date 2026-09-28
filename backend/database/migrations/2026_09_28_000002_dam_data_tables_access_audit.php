<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * دسترسی سطح جدول، ثبت‌کننده/ویرایش‌کننده ردیف، اتصال ردیف به تسک
 * و تاریخچه فعالیت ردیف‌ها در جدول‌های اطلاعات DAM.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('dam_data_tables', function (Blueprint $t) {
            // [{user_id, access: view|edit}] — خالی یعنی همه دارندگان مجوز کلی
            $t->json('grants')->nullable()->after('columns');
        });

        Schema::table('dam_data_rows', function (Blueprint $t) {
            $t->foreignId('created_by')->nullable()->after('position')->constrained('users')->nullOnDelete();
            $t->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $t->foreignId('task_id')->nullable()->after('updated_by')->constrained('tasks')->nullOnDelete();
        });

        Schema::create('dam_data_row_activities', function (Blueprint $t) {
            $t->id();
            $t->foreignId('table_id')->constrained('dam_data_tables')->cascadeOnDelete();
            $t->foreignId('row_id')->nullable()->constrained('dam_data_rows')->nullOnDelete();
            $t->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $t->string('action', 50); // created | updated | deleted | task_linked | task_unlinked
            $t->json('metadata')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['row_id', 'created_at']);
            $t->index(['table_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dam_data_row_activities');
        Schema::table('dam_data_rows', function (Blueprint $t) {
            $t->dropConstrainedForeignId('task_id');
            $t->dropConstrainedForeignId('updated_by');
            $t->dropConstrainedForeignId('created_by');
        });
        Schema::table('dam_data_tables', function (Blueprint $t) {
            $t->dropColumn('grants');
        });
    }
};
