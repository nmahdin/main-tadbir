<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Support\Content\StageAdvanceMode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * تغییر دستی وضعیت مرحله از روی نشان وضعیت در صفحهٔ جزئیات محتوا.
 *
 * درخواست: کلیک روی نشان وضعیت مرحله، فهرست وضعیت‌ها را باز کند و وضعیت را
 * عوض کند؛ وضعیت‌های «تأییدشده» و «در انتظار بررسی» هم قفل نباشند.
 */
class ContentStageStatusTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions): User
    {
        $role = Role::create(['key' => 'stage_status_'.bin2hex(random_bytes(4)), 'name' => 'Stage status', 'is_active' => true]);
        foreach ($permissions as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    /** @return array<string, mixed> */
    private function stage(string $id, string $title, array $overrides = []): array
    {
        return [...[
            'id' => $id,
            'stageKey' => $id,
            'title' => $title,
            'status' => 'not_started',
            'order' => 1,
            'assigneeId' => null,
            'reviewerId' => null,
            'reviewRequired' => true,
            'advanceMode' => StageAdvanceMode::APPROVAL,
            'inputs' => [],
            'outputs' => [],
            'activityLog' => [],
        ], ...$overrides];
    }

    private function content(array $stages): Content
    {
        return Content::create(['title' => 'پروندهٔ وضعیت مرحله', 'type' => 'article', 'status' => 'producing',
            'payload' => ['stages' => $stages, 'history' => []]]);
    }

    private function change(Content $content, string $stage, string $status, ?string $version = null)
    {
        return $this->postJson('/api/v1/contents/'.$content->id.'/stages/'.$stage.'/status', [
            'status' => $status, ...($version ? ['expectedVersion' => $version] : []),
        ]);
    }

    public function test_workflow_manager_can_change_approved_and_pending_review_statuses(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.workflow.manage', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', 'بازبینی سردبیری', ['status' => 'approved', 'order' => 1, 'assigneeId' => (string) $manager->id]),
        ]);

        // «تأییدشده» قفل نیست: خروج از وضعیت پایانی مجاز است.
        $this->change($content, 'one', 'in_progress')->assertOk();
        $content->refresh();
        $this->assertSame('in_progress', $content->payload['stages'][0]['status']);
        $this->assertNotEmpty($content->payload['stages'][0]['activityLog']);

        // «در انتظار بررسی» هم قفل نیست؛ هم ورود و هم خروج از آن.
        $this->change($content->refresh(), 'one', 'pending_approval')->assertOk();
        $this->assertSame('pending_approval', $content->refresh()->payload['stages'][0]['status']);
        $this->change($content->refresh(), 'one', 'approved')->assertOk();
        $this->assertSame('approved', $content->refresh()->payload['stages'][0]['status']);
    }

    public function test_status_change_requires_workflow_permission(): void
    {
        $editor = $this->actor(['content.view', 'content.edit', 'content.approve', 'tasks.view']);
        $content = $this->content([$this->stage('one', 'نگارش', ['status' => 'in_progress', 'assigneeId' => (string) $editor->id])]);

        $this->change($content, 'one', 'approved')->assertForbidden();
        $this->assertSame('in_progress', $content->refresh()->payload['stages'][0]['status']);
    }

    public function test_reopening_a_finished_stage_reopens_its_task(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.workflow.manage', 'tasks.view']);
        $content = $this->content([
            $this->stage('one', 'نگارش', ['status' => 'approved', 'order' => 1, 'assigneeId' => (string) $manager->id]),
        ]);
        $task = Task::create(['title' => 'مرحله «نگارش»', 'kind' => 'content_work', 'assignee_id' => $manager->id,
            'content_id' => $content->id, 'content_stage_id' => 'one', 'status' => 'completed', 'priority' => 'medium']);

        $this->change($content, 'one', 'in_progress')->assertOk();
        $this->assertNotSame('completed', $task->refresh()->status, 'با بازکردن مرحله، تسک آن هم باید از «تکمیل‌شده» بیرون بیاید.');
    }

    public function test_stale_version_is_rejected_instead_of_overwriting(): void
    {
        $manager = $this->actor(['content.view', 'content.edit', 'content.workflow.manage', 'tasks.view']);
        $content = $this->content([$this->stage('one', 'نگارش', ['status' => 'in_progress', 'assigneeId' => (string) $manager->id])]);

        $this->change($content, 'one', 'approved', str_repeat('a', 64))->assertStatus(409);
        $this->assertSame('in_progress', $content->refresh()->payload['stages'][0]['status']);
    }
}
