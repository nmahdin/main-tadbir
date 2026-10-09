<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stable, indexable content code (KM141, RV130, SA03, ...).
 *
 * The column is nullable so existing rows keep working until a code is allocated
 * for them; a code is never reused, so a plain UNIQUE index is the right domain
 * rule (SQL NULLs never collide, so pre-code rows are unaffected). The prefix and
 * sequence policy is operational configuration, not a hardcoded rule: see
 * App\Support\Content\ContentCodePolicy and the `content_code_policies` setting.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contents', function (Blueprint $table): void {
            $table->string('code', 40)->nullable()->after('title');
            $table->unique('code', 'contents_code_unique');
        });
    }

    public function down(): void
    {
        Schema::table('contents', function (Blueprint $table): void {
            $table->dropUnique('contents_code_unique');
            $table->dropColumn('code');
        });
    }
};
