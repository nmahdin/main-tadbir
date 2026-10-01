<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Tests\TestCase;

class PhaseOneSqliteMigrationTest extends TestCase
{
    use DatabaseMigrations;

    public $mockConsoleOutput = false;

    public function runDatabaseMigrations(): void
    {
        if (! app()->environment('testing') || config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Isolated SQLite only.');
        }
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(fn () => RefreshDatabaseState::$migrated = false);
    }

    public function test_constraint_repair_preserves_existing_records_memberships_and_foreign_keys(): void
    {
        $user = User::factory()->create();
        $project = Project::create(['name' => 'Existing', 'status' => 'active']);
        $project->members()->attach($user->id);
        $task = Task::create(['title' => 'Linked', 'project_id' => $project->id, 'status' => 'todo']);
        $migration = require database_path('migrations/2026_09_29_000001_repair_sqlite_archive_status_constraints.php');
        $migration->up();
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'project_id' => $project->id]);
        $this->assertDatabaseHas('project_user', ['project_id' => $project->id, 'user_id' => $user->id]);
        $project->refresh()->update(['status' => 'archived']);
        $task->refresh()->update(['status' => 'archived']);
        $migration->down();
        $this->assertSame('archived', $task->fresh()->status);
        $this->assertSame('archived', $project->fresh()->status);
    }
}
