<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\Schema\WorkspaceIndexes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * ایندکس‌های عملکرد بدون SSH.
 *
 * هاستی که `php artisan migrate` ندارد باید بتواند همین ایندکس‌ها را از پنل
 * نگهداری بسازد. این تست‌ها تضمین می‌کنند: وضعیت درست گزارش می‌شود، ساخت
 * idempotent است، و مسیر HTTP فقط با مجوز «مدیریت تنظیمات» باز است.
 */
class WorkspaceIndexMaintenanceTest extends TestCase
{
    use RefreshDatabase;

    private function actor(bool $canManageSettings = true): User
    {
        $role = Role::create(['key' => 'maintainer', 'name' => 'Maintainer', 'is_active' => true]);
        $keys = $canManageSettings ? ['settings.manage'] : ['tasks.view'];
        foreach ($keys as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_every_declared_index_is_reported_after_the_migration(): void
    {
        // مایگریشن همین ایندکس‌ها را می‌سازد؛ پس روی دیتابیس تازه هیچ‌کدام نباید غایب باشد.
        $status = (new WorkspaceIndexes())->status();

        $declared = collect(WorkspaceIndexes::DEFINITIONS)->flatten(1)->keys()->count();
        $this->assertSame($declared, $status['total']);
        $this->assertSame($declared, $status['present'], 'همهٔ ایندکس‌های اعلام‌شده باید ساخته شده باشند.');
        $this->assertSame(0, $status['missing']);
    }

    public function test_applying_indexes_is_idempotent_and_creates_only_missing_ones(): void
    {
        $indexes = new WorkspaceIndexes();

        // اجرای دوباره روی وضعیت کامل: هیچ ایندکسی ساخته یا حذف نمی‌شود.
        $first = $indexes->ensure();
        $this->assertSame([], $first['created']);
        $this->assertSame([], $first['failed']);
        $this->assertCount(count(WorkspaceIndexes::DEFINITIONS['tasks']), array_filter(
            $first['skipped'],
            fn (string $name) => str_starts_with($name, 'tasks_'),
        ));

        // یک ایندکس را حذف می‌کنیم؛ فقط همان یکی باید دوباره ساخته شود.
        Schema::table('tasks', fn ($table) => $table->dropIndex('tasks_deadline_index'));
        $missing = collect((new WorkspaceIndexes())->status()['tables'])
            ->firstWhere('table', 'tasks')['indexes'];
        $this->assertFalse(collect($missing)->firstWhere('name', 'tasks_deadline_index')['exists']);

        $second = $indexes->ensure();
        $this->assertSame(['tasks_deadline_index'], $second['created']);
        $this->assertSame(0, $indexes->status()['missing']);

        // و اجرای سوم دوباره چیزی نمی‌سازد.
        $this->assertSame([], $indexes->ensure()['created']);
    }

    public function test_the_maintenance_panel_reports_and_creates_missing_indexes(): void
    {
        $this->actor();

        $overview = $this->getJson('/api/v1/maintenance/overview')->assertOk();
        $overview->assertJsonPath('data.indexes.missing', 0);
        $overview->assertJsonPath('data.indexes.total', collect(WorkspaceIndexes::DEFINITIONS)->flatten(1)->keys()->count());

        Schema::table('contents', fn ($table) => $table->dropIndex('contents_type_status_index'));
        $this->getJson('/api/v1/maintenance/overview')->assertJsonPath('data.indexes.missing', 1);

        $applied = $this->postJson('/api/v1/maintenance/indexes')->assertOk();
        $applied->assertJsonPath('data.created', ['contents_type_status_index']);
        $applied->assertJsonPath('data.status.missing', 0);
        $this->assertSame(0, (new WorkspaceIndexes())->status()['missing']);

        // اجرای دوباره از پنل: هیچ ایندکسی ساخته نمی‌شود و پیام روشن است.
        $this->postJson('/api/v1/maintenance/indexes')
            ->assertOk()
            ->assertJsonPath('data.created', [])
            ->assertJsonPath('message', 'همهٔ ایندکس‌های عملکرد از قبل ساخته شده بودند.');
    }

    public function test_applying_indexes_requires_the_settings_permission(): void
    {
        $this->actor(false);

        $this->postJson('/api/v1/maintenance/indexes')->assertForbidden();
        $this->getJson('/api/v1/maintenance/overview')->assertForbidden();
    }
}
