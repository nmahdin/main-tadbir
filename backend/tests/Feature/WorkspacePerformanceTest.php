<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\AutomationThrottle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * بهینه‌سازی مسیرهای پرتردد: ایندکس‌های گزارش/فهرست، حذف N+1 وضعیت «دنبال‌کردن»
 * و اجرای محدود کارهای خودکار در مسیر خواندن.
 */
class WorkspacePerformanceTest extends TestCase
{
    use RefreshDatabase;

    private function actor(): User
    {
        $role = Role::create(['key' => 'performance', 'name' => 'Performance', 'is_active' => true]);
        foreach (['content.view', 'content.watch', 'reports.view'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function content(string $title, User $owner): Content
    {
        // مالک پرونده، شرکت‌کنندهٔ آن است؛ «دنبال‌کردن» برای غیر شرکت‌کننده مجاز نیست.
        return Content::create([
            'title' => $title,
            'type' => 'article',
            'status' => 'producing',
            'owner_id' => $owner->id,
            'payload' => [],
        ]);
    }

    /** تعداد کوئری‌های یک درخواست کامل فهرست محتوا. */
    private function listQueryCount(): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/v1/contents?per_page=20')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_content_list_answers_the_watch_state_in_the_same_query(): void
    {
        $actor = $this->actor();
        $watched = $this->content('دنبال‌شده', $actor);
        $other = $this->content('دنبال‌نشده', $actor);

        $this->postJson("/api/v1/contents/{$watched->id}/watch")->assertSuccessful();

        $rows = collect($this->getJson('/api/v1/contents?per_page=20')->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($rows[(string) $watched->id]['isWatched']);
        $this->assertFalse($rows[(string) $other->id]['isWatched']);

        // یک بار فهرست خوانده می‌شود تا محدودکنندهٔ کارهای خودکار گرم شود؛ سپس
        // تعداد کوئری‌ها با رشد تعداد پرونده‌ها نباید تغییر کند (هیچ کوئری‌ای برای
        // هر ردیف زده نمی‌شود).
        Cache::flush();
        $this->getJson('/api/v1/contents?per_page=20')->assertOk();
        $baseline = $this->listQueryCount();
        foreach (['الف', 'ب', 'ج', 'د', 'ه'] as $title) {
            $this->content($title, $actor);
        }
        $this->assertSame($baseline, $this->listQueryCount(), 'فهرست محتوا نباید برای هر ردیف کوئری جدا بزند.');
    }

    public function test_reporting_indexes_exist_on_the_hot_workspace_tables(): void
    {
        $expected = [
            'contents' => ['contents_status_deadline_index', 'contents_type_status_index', 'contents_deadline_index'],
            'tasks' => ['tasks_status_deadline_index', 'tasks_assignee_status_index', 'tasks_project_status_index', 'tasks_deadline_index'],
            'workspace_records' => ['workspace_records_kind_status_index'],
        ];

        foreach ($expected as $table => $indexes) {
            $names = collect(Schema::getIndexes($table))->pluck('name');
            foreach ($indexes as $index) {
                $this->assertTrue($names->contains($index), "ایندکس {$index} روی {$table} ساخته نشده است.");
            }
        }
    }

    public function test_automation_work_runs_at_most_once_per_window(): void
    {
        Cache::flush();
        $runs = 0;
        $work = function () use (&$runs) {
            $runs++;

            return 'done';
        };

        $this->assertSame('done', AutomationThrottle::once('test-key', 60, $work));
        $this->assertNull(AutomationThrottle::once('test-key', 60, $work));
        $this->assertSame(1, $runs);

        // اجرای ناموفق، بازه را «انجام‌شده» جا نمی‌زند و اجرای بعدی آزاد است.
        try {
            AutomationThrottle::once('failing-key', 60, fn () => throw new \RuntimeException('boom'));
            $this->fail('خطای کار خودکار باید بالا برود.');
        } catch (\RuntimeException) {
            // انتظار می‌رود
        }
        $this->assertSame('ok', AutomationThrottle::once('failing-key', 60, fn () => 'ok'));
    }
}
