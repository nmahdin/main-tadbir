<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add 'archived' to the projects/tasks status enums.
     * SQLite stores these as plain text (no change needed there);
     * MySQL enforces the ENUM list so the column must be altered.
     */
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE projects MODIFY COLUMN status ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived') NOT NULL DEFAULT 'planning'");
        DB::statement("ALTER TABLE tasks MODIFY COLUMN status ENUM('backlog', 'todo', 'in_progress', 'review', 'completed', 'archived') NOT NULL DEFAULT 'backlog'");
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::table('projects')->where('status', 'archived')->update(['status' => 'cancelled']);
        DB::table('tasks')->where('status', 'archived')->update(['status' => 'completed']);
        DB::statement("ALTER TABLE projects MODIFY COLUMN status ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled') NOT NULL DEFAULT 'planning'");
        DB::statement("ALTER TABLE tasks MODIFY COLUMN status ENUM('backlog', 'todo', 'in_progress', 'review', 'completed') NOT NULL DEFAULT 'backlog'");
    }
};
