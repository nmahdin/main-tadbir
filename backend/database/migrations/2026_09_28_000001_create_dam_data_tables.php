<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * جدول‌های اطلاعات (شیت‌های شبه‌اکسل) در ماژول دارایی‌های دیجیتال.
 *
 * هر «جدول» یک شیت مجزاست با ستون‌های قابل تنظیم؛ هر «ردیف» یک رکورد
 * دیتابیسی است که سلول‌هایش به‌صورت JSON ذخیره می‌شوند.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('dam_data_tables', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->text('description')->nullable();
            $t->json('columns')->nullable();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamps();
        });

        Schema::create('dam_data_rows', function (Blueprint $t) {
            $t->id();
            $t->foreignId('table_id')->constrained('dam_data_tables')->cascadeOnDelete();
            $t->json('cells')->nullable();
            $t->unsignedInteger('position')->default(0);
            $t->timestamps();
            $t->index(['table_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dam_data_rows');
        Schema::dropIfExists('dam_data_tables');
    }
};
