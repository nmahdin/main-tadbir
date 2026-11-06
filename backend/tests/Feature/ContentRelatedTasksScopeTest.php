<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * دور ۸۵ — تب «تسک‌های مربوط» در صفحهٔ محتوا.
 *
 * پیش‌تر فهرست `GET /tasks` همیشه به «مسئول = من» محدود می‌شد؛ نتیجه این بود که
 * در صفحهٔ یک پروندهٔ محتوا، وظایف تکمیل‌شده یا وظایف ارزیاب/ناشر (که به کاربر
 * دیگری واگذار شده‌اند) هرگز دیده نمی‌شدند و تب ناقص می‌ماند. اکنون برای همان
 * پرونده — و فقط با مجوز دیدن آن محتوا — همهٔ وظایف پرونده برمی‌گردد؛ دامنهٔ
 * شخصیِ کارتابل دست‌نخورده است.
 */
class ContentRelatedTasksScopeTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions): User
    {
        $key = 'scope_'.Str::random(10);
        $role = Role::create(['key' => $key, 'name' => 'Content scope test', 'is_active' => true]);
        foreach ($permissions as $permission) {
            $role->permissions()->attach(
                Permission::firstOrCreate(['key' => $permission], ['label' => $permission, 'category' => 'content'])
            );
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $key]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function content(User $owner): Content
    {
        return Content::create([
            'title' => 'محتوای تب تسک‌های مربوط',
            'type' => 'article',
            'status' => 'producing',
            'owner_id' => $owner->id,
            'payload' => ['stages' => [], 'history' => []],
        ]);
    }

    private function task(User $assignee, ?Content $content, string $status): Task
    {
        return Task::create([
            'title' => 'وظیفهٔ '.$status,
            'assignee_id' => $assignee->id,
            'status' => $status,
            'priority' => 'medium',
            'content_id' => $content?->id,
            'kind' => 'content_work',
        ]);
    }

    public function test_content_tasks_include_completed_work_assigned_to_others(): void
    {
        $viewer = $this->actor(['content.view', 'tasks.view']);
        $content = $this->content($viewer);
        // وظیفهٔ تکمیل‌شده در اختیار کاربر دیگری است (ارزیاب/ناشر).
        $other = User::factory()->create(['status' => 'active']);
        $done = $this->task($other, $content, 'completed');
        $mine = $this->task($viewer, $content, 'in_progress');
        // وظیفهٔ نامرتبط با این پرونده نباید در فهرست بیاید.
        $unrelated = $this->task($other, null, 'completed');

        $response = $this->getJson('/api/v1/tasks?content_id='.$content->id.'&per_page=50')->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->map(fn ($id) => (string) $id)->all();

        $this->assertContains((string) $done->id, $ids, 'وظیفهٔ تکمیل‌شدهٔ پرونده باید دیده شود.');
        $this->assertContains((string) $mine->id, $ids);
        $this->assertNotContains((string) $unrelated->id, $ids);
    }

    public function test_personal_task_list_stays_limited_to_the_viewer(): void
    {
        $viewer = $this->actor(['content.view', 'tasks.view']);
        $content = $this->content($viewer);
        $other = User::factory()->create(['status' => 'active']);
        $foreign = $this->task($other, $content, 'completed');
        $mine = $this->task($viewer, null, 'completed');

        // بدون `content_id` همان دامنهٔ شخصیِ کارتابل اعمال می‌شود.
        $ids = collect($this->getJson('/api/v1/tasks?per_page=50')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (string) $id)->all();

        $this->assertContains((string) $mine->id, $ids);
        $this->assertNotContains((string) $foreign->id, $ids, 'کارتابل شخصی نباید وظایف دیگران را نشان دهد.');
    }

    public function test_content_scope_requires_access_to_that_content(): void
    {
        $owner = User::factory()->create(['status' => 'active']);
        $content = $this->content($owner);
        $foreign = $this->task($owner, $content, 'completed');

        // کاربری که مجوز/عضویتِ دیدن این محتوا را ندارد، حتی با `content_id` هم
        // فهرست شخصی می‌گیرد؛ دامنهٔ محتوا راهی برای دیدن وظایف دیگران نیست.
        $this->actor(['tasks.view']);
        $ids = collect($this->getJson('/api/v1/tasks?content_id='.$content->id.'&per_page=50')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (string) $id)->all();

        $this->assertNotContains((string) $foreign->id, $ids);
    }
}
