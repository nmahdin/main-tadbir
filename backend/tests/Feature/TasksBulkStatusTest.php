<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UX-02-3-FINAL tasks bulk status: selection spans one page of ids,
 * but every record is authorized, transitioned, and audited through
 * the exact single-record service. Unauthorized records fail
 * individually; nothing is partially hidden or silently skipped.
 */
class TasksBulkStatusTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create(['username' => 'bulk.user']);
        $this->other = User::factory()->create(['username' => 'bulk.other']);
        $role = Role::create([
            'key' => 'bulk_test', 'name' => 'Bulk Test', 'description' => 'test',
            'color' => '#000000', 'is_system' => false, 'is_active' => true,
        ]);
        $permissions = collect(['tasks.view'])->map(fn (string $key) => Permission::create([
            'key' => $key, 'label' => $key, 'description' => $key, 'category' => 'tasks',
        ]));
        $role->permissions()->sync($permissions->pluck('id'));
        $this->user->update(['role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($this->user);
    }

    private function task(User $assignee, string $title): Task
    {
        return Task::create([
            'title' => $title, 'description' => $title, 'assignee_id' => $assignee->id,
            'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general',
        ]);
    }

    public function test_bulk_status_authorizes_and_audits_per_record(): void
    {
        $mineA = $this->task($this->user, 'Mine A');
        $mineB = $this->task($this->user, 'Mine B');
        $foreign = $this->task($this->other, 'Foreign');

        $response = $this->postJson('/api/v1/tasks/bulk-status', [
            'task_ids' => [$mineA->id, $mineB->id, $foreign->id, 999999],
            'status' => 'in_progress',
        ])->assertOk();

        $this->assertSame([$mineA->id, $mineB->id], $response->json('data.updated'));
        $failed = collect($response->json('data.failed'))->keyBy('id');
        $this->assertSame(403, $failed[$foreign->id]['code'], 'foreign assignee task must fail individually');
        $this->assertSame(404, $failed[999999]['code']);

        $this->assertSame('in_progress', $mineA->refresh()->status);
        $this->assertSame('backlog', $foreign->refresh()->status, 'unauthorized record stays untouched');

        // The single-record audit trail exists for each updated task.
        $this->assertSame(2, ActivityLog::query()->where('type', 'status_change')->whereIn('task_id', [$mineA->id, $mineB->id])->count());
    }

    public function test_bulk_status_validates_input(): void
    {
        $this->postJson('/api/v1/tasks/bulk-status', ['task_ids' => [], 'status' => 'in_progress'])->assertUnprocessable();
        $this->postJson('/api/v1/tasks/bulk-status', ['task_ids' => [1], 'status' => 'nope'])->assertUnprocessable();
        $this->postJson('/api/v1/tasks/bulk-status', ['task_ids' => ['x'], 'status' => 'in_progress'])->assertUnprocessable();

        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/v1/tasks/bulk-status', ['task_ids' => [1], 'status' => 'in_progress'])->assertForbidden();
    }
}
