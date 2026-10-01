<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('projects', 'key')) {
            return;
        }

        Schema::table('projects', function (Blueprint $table): void {
            $table->dropUnique('projects_key_unique');
            $table->dropColumn('key');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('projects', 'key')) {
            return;
        }

        Schema::table('projects', function (Blueprint $table): void {
            // Nullable keeps rollback safe for existing projects; the identifier is no longer used by the application.
            $table->string('key', 10)->nullable()->unique();
        });
    }
};
