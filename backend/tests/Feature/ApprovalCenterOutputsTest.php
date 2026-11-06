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
 * «نمایش خروجی» در مرکز بررسی و تأیید باید **همهٔ** خروجی‌های مرحله را بیاورد،
 * نه فقط خروجی خودِ مرحلهٔ بازبینی را.
 *
 * در جریان واقعی، فایل در مرحلهٔ تولید ثبت می‌شود و مرحلهٔ بازبینی فقط تأیید
 * است؛ پیش‌تر پنجرهٔ خروجی برای بیشتر پرونده‌ها خالی بود.
 */
class ApprovalCenterOutputsTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions): User
    {
        $role = Role::create(['key' => 'approval_'.bin2hex(random_bytes(4)), 'name' => 'Approval', 'is_active' => true]);
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

    public function test_review_window_lists_own_outputs_and_the_previous_stage_outputs(): void
    {
        $reviewer = $this->actor(['content.view', 'content.approve', 'tasks.view']);

        $content = Content::create([
            'title' => 'پوستر کمپین',
            'type' => 'poster',
            'status' => 'producing',
            'payload' => ['stages' => [
                $this->stage('produce', 'تولید گرافیک', ['status' => 'approved', 'order' => 1, 'outputs' => [
                    ['id' => 'out-1', 'name' => 'پوستر نهایی', 'type' => 'file', 'url' => '/api/v1/dam/files/7', 'fileName' => 'poster.pdf', 'fileSize' => '۲ مگابایت'],
                ]]),
                // مرحلهٔ بازبینی خروجی خودش را ندارد: همان حالتی که پنجره را خالی می‌کرد.
                $this->stage('review', 'بازبینی سردبیری', ['status' => 'pending_approval', 'order' => 2, 'reviewerId' => (string) $reviewer->id]),
            ]],
        ]);
        Task::create(['title' => 'بازبینی محتوا', 'kind' => 'content_review', 'assignee_id' => $reviewer->id,
            'content_id' => $content->id, 'content_stage_id' => 'review', 'status' => 'review', 'priority' => 'medium']);

        $response = $this->getJson('/api/v1/approvals')->assertOk();
        $row = $response->json('data.0');

        $this->assertNotNull($row, 'ردیف بررسی باید برگردد.');
        $this->assertSame('بازبینی سردبیری', $row['stageTitle']);
        $this->assertCount(1, $row['outputs']);
        $this->assertSame('out-1', $row['outputs'][0]['id']);
        $this->assertSame('تولید گرافیک', $row['outputs'][0]['stageTitle']);
        $this->assertSame('previous', $row['outputs'][0]['relation']);
        $this->assertSame('produce', $row['outputs'][0]['stageId']);
    }

    public function test_review_window_includes_forwarded_and_own_outputs_without_duplicates(): void
    {
        $reviewer = $this->actor(['content.view', 'content.approve', 'tasks.view']);

        $content = Content::create([
            'title' => 'گزارش تحلیلی',
            'type' => 'article',
            'status' => 'producing',
            'payload' => ['stages' => [
                $this->stage('write', 'نگارش متن', ['status' => 'approved', 'order' => 1, 'outputs' => [
                    ['id' => 'out-text', 'name' => 'متن نهایی', 'type' => 'text', 'value' => 'متن کامل گزارش'],
                    ['id' => 'out-forward', 'name' => 'فایل ارجاعی', 'type' => 'file', 'url' => '/api/v1/dam/files/9', 'forwardedToStageId' => 'approve'],
                ]]),
                $this->stage('approve', 'تأیید نهایی', ['status' => 'pending_approval', 'order' => 2,
                    'reviewerId' => (string) $reviewer->id, 'dependsOnStageIds' => ['write'],
                    'outputs' => [['id' => 'out-own', 'name' => 'یادداشت داور', 'type' => 'text', 'value' => 'بدون ایراد']]]),
            ]],
        ]);
        Task::create(['title' => 'تأیید محتوا', 'kind' => 'content_review', 'assignee_id' => $reviewer->id,
            'content_id' => $content->id, 'content_stage_id' => 'approve', 'status' => 'review', 'priority' => 'medium']);

        $row = $this->getJson('/api/v1/approvals')->assertOk()->json('data.0');
        $ids = array_column($row['outputs'], 'id');
        $relations = array_column($row['outputs'], 'relation', 'id');

        // خروجی خودِ مرحله اول می‌آید، بعد ارجاعی و پیش‌نیاز؛ هیچ تکراری نیست.
        $this->assertSame('out-own', $ids[0]);
        $this->assertSame('current', $relations['out-own']);
        $this->assertContains('out-forward', $ids);
        $this->assertContains('out-text', $ids);
        $this->assertSame('forwarded', $relations['out-forward']);
        $this->assertSame('dependency', $relations['out-text']);
        $this->assertSame(count($ids), count(array_unique($ids)));
    }

    public function test_review_window_is_empty_only_when_no_stage_has_outputs(): void
    {
        $reviewer = $this->actor(['content.view', 'content.approve', 'tasks.view']);
        $content = Content::create([
            'title' => 'محتوای بدون خروجی',
            'type' => 'article',
            'status' => 'producing',
            'payload' => ['stages' => [
                $this->stage('one', 'قدم اول', ['status' => 'approved', 'order' => 1]),
                $this->stage('review', 'بازبینی', ['status' => 'pending_approval', 'order' => 2, 'reviewerId' => (string) $reviewer->id]),
            ]],
        ]);
        Task::create(['title' => 'بازبینی', 'kind' => 'content_review', 'assignee_id' => $reviewer->id,
            'content_id' => $content->id, 'content_stage_id' => 'review', 'status' => 'review', 'priority' => 'medium']);

        $row = $this->getJson('/api/v1/approvals')->assertOk()->json('data.0');
        $this->assertSame([], $row['outputs']);
    }
}
