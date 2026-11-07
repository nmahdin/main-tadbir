<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * بارگذاری فهرست وظایف نباید با پارامترهای خالی رابط بشکند.
 *
 * رابطِ قدیمی (یا نسخهٔ کش‌شدهٔ آن) `direction=undefined&sort=undefined` را در
 * نشانی می‌گذاشت و سرور با «مقدار انتخاب‌شده برای direction معتبر نیست» پاسخ
 * ۴۲۲ می‌داد؛ صفحهٔ وظایف خالی می‌ماند.
 */
class TaskListQueryDefaultsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(): User
    {
        $role = Role::create(['key' => 'task_list_'.bin2hex(random_bytes(4)), 'name' => 'Task list', 'is_active' => true]);
        foreach (['tasks.view'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_an_undefined_direction_does_not_break_the_task_list(): void
    {
        $user = $this->actor();
        Task::create(['title' => 'وظیفهٔ من', 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);

        $this->getJson('/api/v1/tasks?assignee=me&page=1&per_page=20&sort=undefined&direction=undefined&status=&priority=')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'وظیفهٔ من');
    }

    public function test_a_valid_direction_still_orders_the_list(): void
    {
        $user = $this->actor();
        Task::create(['title' => 'قدیمی', 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);
        Task::create(['title' => 'تازه', 'assignee_id' => $user->id, 'status' => 'backlog', 'priority' => 'medium', 'kind' => 'general']);

        $this->getJson('/api/v1/tasks?assignee=me&direction=desc')->assertOk()->assertJsonPath('data.0.title', 'تازه');
        $this->getJson('/api/v1/tasks?assignee=me&direction=asc')->assertOk()->assertJsonPath('data.0.title', 'قدیمی');
    }

    public function test_a_really_invalid_direction_is_still_rejected(): void
    {
        $this->actor();

        // مقدارِ نامعتبرِ واقعی نباید بی‌صدا پذیرفته شود؛ فقط کلیدهای خالی/undefined نادیده می‌روند.
        $this->getJson('/api/v1/tasks?assignee=me&direction=upwards')->assertUnprocessable()
            ->assertJsonValidationErrors('direction');
    }
}
