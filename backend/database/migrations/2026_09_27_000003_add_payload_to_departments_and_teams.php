<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ستون payload برای نگهداری داده‌های تکمیلی فرانت‌اند
 * (اعضای دپارتمان، شناسه پروژه‌های تیم و...).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table): void {
            $table->json('payload')->nullable()->after('status');
        });

        Schema::table('teams', function (Blueprint $table): void {
            $table->json('payload')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('teams', function (Blueprint $table): void {
            $table->dropColumn('payload');
        });

        Schema::table('departments', function (Blueprint $table): void {
            $table->dropColumn('payload');
        });
    }
};
