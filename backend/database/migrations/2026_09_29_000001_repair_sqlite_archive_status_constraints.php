<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Laravel enums on SQLite have CHECK constraints; the older MySQL-only
        // archive migration did not widen them. Production MySQL is unchanged.
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            return;
        }
        Schema::table('projects', function (Blueprint $table): void {
            $table->enum('status', ['planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived'])->default('planning')->change();
        });
        Schema::table('tasks', function (Blueprint $table): void {
            $table->enum('status', ['backlog', 'todo', 'in_progress', 'review', 'completed', 'archived'])->default('backlog')->change();
        });
    }

    public function down(): void
    {
        // Do not rewrite archived records or silently narrow the accepted domain.
    }
};
