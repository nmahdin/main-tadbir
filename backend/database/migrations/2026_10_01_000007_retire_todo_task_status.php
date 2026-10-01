<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tasks')) {
            DB::table('tasks')->where('status', 'todo')->update(['status' => 'backlog']);
            if (Schema::hasColumn('tasks', 'previous_status')) {
                DB::table('tasks')->where('previous_status', 'todo')->update(['previous_status' => 'backlog']);
            }
            if (DB::getDriverName() === 'mysql') {
                DB::statement("ALTER TABLE tasks MODIFY COLUMN status ENUM('backlog', 'in_progress', 'review', 'completed', 'archived') NOT NULL DEFAULT 'backlog'");
            }
        }

        if (Schema::hasTable('project_templates')) {
            DB::table('project_templates')->orderBy('id')->chunkById(100, function ($templates): void {
                foreach ($templates as $template) {
                    $updates = [];
                    $tasks = json_decode($template->tasks ?: '[]', true);
                    if (is_array($tasks)) {
                        $tasksChanged = false;
                        foreach ($tasks as &$task) {
                            if (is_array($task) && ($task['status'] ?? null) === 'todo') {
                                $task['status'] = 'backlog';
                                $tasksChanged = true;
                            }
                        }
                        unset($task);
                        if ($tasksChanged) {
                            $updates['tasks'] = json_encode($tasks, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        }
                    }

                    $stages = json_decode($template->stages ?: '[]', true);
                    if (is_array($stages)) {
                        $filteredStages = array_values(array_filter(
                            $stages,
                            fn ($stage) => ! is_array($stage) || ($stage['id'] ?? null) !== 'todo',
                        ));
                        if (count($filteredStages) !== count($stages)) {
                            $updates['stages'] = json_encode($filteredStages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        }
                    }

                    if ($updates !== []) {
                        DB::table('project_templates')->where('id', $template->id)->update([
                            ...$updates,
                            'updated_at' => now(),
                        ]);
                    }
                }
            });
        }

        if (Schema::hasTable('system_settings')) {
            $setting = DB::table('system_settings')->where('key', 'task_statuses')->first();
            if ($setting) {
                $statuses = json_decode($setting->value ?: '[]', true);
                if (is_array($statuses)) {
                    $statuses = array_values(array_filter($statuses, fn ($status) => is_array($status) && ($status['id'] ?? null) !== 'todo'));
                    foreach ($statuses as $index => &$status) {
                        $status['order'] = $index + 1;
                    }
                    unset($status);
                    DB::table('system_settings')->where('id', $setting->id)->update([
                        'value' => json_encode($statuses, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tasks') && DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY COLUMN status ENUM('backlog', 'todo', 'in_progress', 'review', 'completed', 'archived') NOT NULL DEFAULT 'backlog'");
        }
    }
};
