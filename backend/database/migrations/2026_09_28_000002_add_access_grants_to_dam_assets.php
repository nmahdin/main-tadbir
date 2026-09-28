<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * دسترسی دانه‌بندی‌شده دارایی‌ها: به‌جای سطح محرمانگی صرف،
 * پروژه‌ها، اشخاص و نقش‌های مجاز هر دارایی ذخیره می‌شود.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('dam_assets', function (Blueprint $t) {
            $t->json('access_grants')->nullable()->after('confidentiality');
        });
    }

    public function down(): void
    {
        Schema::table('dam_assets', function (Blueprint $t) {
            $t->dropColumn('access_grants');
        });
    }
};
