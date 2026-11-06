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
 * «نمایش خروجی» در مرکز بررسی و تأیید باید خروجی **همان مرحله‌ای** را بیاورد که
 * در انتظار بررسی است — نه همهٔ خروجی‌های محتوا و نه خروجی مرحله‌های پیشین.
 *
 * تنها استثنا، خروجی‌هایی است که مرحلهٔ دیگری صریحاً به همین مرحله ارجاع داده
 * است (`forwardedToStageId`)؛ همان‌ها هم با نام مرحلهٔ مبدأ و نسبت `forwarded`
 * برمی‌گردند تا داور بداند از کجا آمده‌اند.
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

    /** یک ردیف بررسی برای همین کاربر می‌سازد و ردیف API را برمی‌گرداند. */
    private function reviewRow(Content $content, User $reviewer, string $stageId): array|null
    {
        Task::create(['title' => 'بازبینی محتوا', 'kind' => 'content_review', 'assignee_id' => $reviewer->id,
            'content_id' => $content->id, 'content_stage_id' => $stageId, 'status' => 'review', 'priority' => 'medium']);

        return $this->getJson('/api/v1/approvals')->assertOk()->json('data.0');
    }

    public function test_review_window_shows_only_the_stage_under_review(): void
    {
        $reviewer = $this->actor(['content.view', 'content.approve', 'tasks.view']);

        $content = Content::create([
            'title' => 'پوستر کمپین',
            'type' => 'poster',
            'status' => 'producing',
            'payload' => ['stages' => [
                $this->stage('produce', 'تولید گرافیک', ['status' => 'approved', 'order' => 1, 'outputs' => [
                    ['id' => 'out-1', 'name' => 'پوستر نهایی', 'type' => 'file', 'url' => '/api/v1/dam/files/7', 'fileName' => 'poster.pdf'],
                ]]),
                $this->stage('review', 'بازبینی سردبیری', ['status' => 'pending_approval', 'order' => 2,
                    'reviewerId' => (string) $reviewer->id, 'outputs' => [
                        ['id' => 'out-review', 'name' => 'یادداشت داور', 'type' => 'text', 'value' => 'بدون ایراد'],
                    ]]),
            ]],
        ]);

        $row = $this->reviewRow($content, $reviewer, 'review');

        $this->assertNotNull($row, 'ردیف بررسی باید برگردد.');
        $this->assertSame('بازبینی سردبیری', $row['stageTitle']);
        $this->assertSame(['out-review'], array_column($row['outputs'], 'id'), 'فقط خروجی همین مرحله باید بیاید.');
        $this->assertSame('current', $row['outputs'][0]['relation']);
        $this->assertNotContains('out-1', array_column($row['outputs'], 'id'), 'خروجی مرحلهٔ قبل نباید نمایش داده شود.');
    }

    public function test_review_window_is_empty_when_the_review_stage_has_no_outputs(): void
    {
        $reviewer = $this->actor(['content.view', 'content.approve', 'tasks.view']);
        $content = Content::create([
            'title' => 'محتوای بدون خروجی بازبینی',
            'type' => 'article',
            'status' => 'producing',
            'payload' => ['stages' => [
                $this->stage('write', 'نگارش', ['status' => 'approved', 'order' => 1, 'outputs' => [
                    ['id' => 'out-write', 'name' => 'متن اصلی', 'type' => 'text', 'value' => 'متن'],
                ]]),
                $this->stage('review', 'بازبینی', ['status' => 'pending_approval', 'order' => 2, 'reviewerId' => (string) $reviewer->id]),
            ]],
        ]);

        $row = $this->reviewRow($content, $reviewer, 'review');
        $this->assertSame([], $row['outputs']);
    }

    public function test_review_window_includes_outputs_forwarded_to_this_stage_without_duplicates(): void
    {
        $reviewer = $this->actor(['content.view', 'content.approve', 'tasks.view']);
        $content = Content::create([
            'title' => 'گزارش تحلیلی',
            'type' => 'article',
            'status' => 'producing',
            'payload' => ['stages' => [
                $this->stage('write', 'نگارش متن', ['status' => 'approved', 'order' => 1, 'outputs' => [
                    ['id' => 'out-sent', 'name' => 'فایل ارجاعی', 'type' => 'file', 'url' => '/api/v1/dam/files/9', 'forwardedToStageId' => 'approve'],
                    ['id' => 'out-kept', 'name' => 'فایل داخلی', 'type' => 'file', 'url' => '/api/v1/dam/files/10'],
                ]]),
                $this->stage('approve', 'تأیید نهایی', ['status' => 'pending_approval', 'order' => 2,
                    'reviewerId' => (string) $reviewer->id,
                    'outputs' => [['id' => 'out-own', 'name' => 'یادداشت داور', 'type' => 'text', 'value' => 'بدون ایراد']]]),
            ]],
        ]);

        $row = $this->reviewRow($content, $reviewer, 'approve');
        $ids = array_column($row['outputs'], 'id');
        $relations = array_column($row['outputs'], 'relation', 'id');

        $this->assertSame('out-own', $ids[0]);
        $this->assertSame('current', $relations['out-own']);
        $this->assertContains('out-sent', $ids);
        $this->assertSame('forwarded', $relations['out-sent']);
        $this->assertNotContains('out-kept', $ids, 'خروجی ارجاع‌نشدهٔ مرحلهٔ دیگر نباید بیاید.');
        $this->assertSame(count($ids), count(array_unique($ids)));
        $this->assertSame('نگارش متن', $row['outputs'][array_search('out-sent', $ids, true)]['stageTitle']);
    }
}
