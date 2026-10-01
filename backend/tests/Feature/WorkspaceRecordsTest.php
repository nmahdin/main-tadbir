<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * پوشش رگرسیون مسیرهای رکوردهای فضای کار (ایده، جلسه، نامه) و ماتریس دسترسی آن‌ها.
 *
 * نکته: قبلاً به‌داخل نبودن use مسیرها در routes/api.php خطای
 * «Target class [WorkspaceRecordController] does not exist» هنگام ثبت ایده/جلسه
 * رخ می‌داد؛ این آزمون‌ها از تکرار آن جلوگیری می‌کنند.
 */
class WorkspaceRecordsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * کاربری با نقش و دسترسی‌های مشخص می‌سازد و به‌عنوان او احراز هویت می‌کند.
     *
     * @param  array<int, string>  $permissions
     */
    private function actingAsUser(string $roleKey, array $permissions): User
    {
        $role = Role::query()->create([
            'key' => $roleKey,
            'name' => $roleKey,
            'description' => 'Test role',
            'color' => '#000000',
            'is_system' => false,
            'is_active' => true,
        ]);

        $permissionModels = collect($permissions)->map(fn (string $key) => Permission::query()->updateOrCreate(
            ['key' => $key],
            ['label' => $key, 'description' => $key, 'category' => 'tests'],
        ));

        $role->permissions()->sync($permissionModels->pluck('id'));

        $user = User::factory()->create([
            'username' => str_replace('_', '.', $roleKey).'.'.uniqid(),
            'role_id' => $role->id,
            'role_key' => $role->key,
        ]);

        Sanctum::actingAs($user);

        return $user;
    }

    public function test_idea_and_meeting_endpoints_resolve_and_create_records(): void
    {
        $this->actingAsUser('idea_creator', ['thinktank.view', 'thinktank.create_idea', 'meetings.create']);

        $this->postJson('/api/v1/ideas', [
            'title' => 'اتوماسیون آرشیو',
            'description' => 'ثبت ایده آزمایشی',
            'status' => 'under_review',
            'priority' => 'high',
            'creatorId' => '1',
            'tags' => [],
            'comments' => [],
            'activities' => [],
            'votes' => [],
        ])->assertCreated()
            ->assertJsonPath('data.title', 'اتوماسیون آرشیو');

        $this->postJson('/api/v1/think-tank-meetings', [
            'title' => 'جلسه بارش فکر هفتگی',
            'status' => 'scheduled',
            'date' => '2026-10-05',
            'time' => '10:00',
            'organizerId' => '1',
            'agenda' => [],
        ])->assertCreated()
            ->assertJsonPath('data.title', 'جلسه بارش فکر هفتگی');

        $this->getJson('/api/v1/ideas')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_idea_endpoints_require_view_permission(): void
    {
        $this->actingAsUser('no_thinktank', ['projects.view']);

        $this->getJson('/api/v1/ideas')->assertForbidden();
        $this->postJson('/api/v1/ideas', ['title' => 'مجوز ندارم'])->assertForbidden();
    }

    public function test_user_with_vote_permission_can_update_votes_but_not_other_fields(): void
    {
        $creator = $this->actingAsUser('idea_editor', ['thinktank.view', 'thinktank.create_idea', 'thinktank.edit_idea']);

        $idea = WorkspaceRecord::query()->create([
            'kind' => WorkspaceRecord::KIND_IDEA,
            'title' => 'ایده رأی‌گیری',
            'status' => 'under_review',
            'owner_id' => $creator->id,
            'payload' => [
                'title' => 'ایده رأی‌گیری',
                'status' => 'under_review',
                'creatorId' => (string) $creator->id,
                'votes' => [],
                'comments' => [],
                'updatedAt' => '1400/01/01',
            ],
        ]);

        $voter = $this->actingAsUser('idea_voter', ['thinktank.view', 'thinktank.vote']);

        // تغییر محدود به فیلدهای رأی → با دسترسی thinktank.vote مجاز است.
        $this->putJson("/api/v1/ideas/{$idea->id}", [
            'title' => 'ایده رأی‌گیری',
            'status' => 'under_review',
            'creatorId' => (string) $creator->id,
            'votes' => [['userId' => (string) $voter->id, 'option' => 'support']],
            'comments' => [],
            'updatedAt' => '1400/01/02',
        ])->assertOk();

        // تغییر فیلد غیرمرتبط (عنوان) → نیازمند دسترسی edit_idea است.
        $this->putJson("/api/v1/ideas/{$idea->id}", [
            'title' => 'تغییر عنوان بدون مجوز ویرایش',
            'status' => 'under_review',
            'votes' => [],
            'comments' => [],
            'updatedAt' => '1400/01/03',
        ])->assertForbidden();
    }

    public function test_letter_referral_and_archive_updates_accept_dedicated_permissions(): void
    {
        $author = $this->actingAsUser('letter_editor', ['secretariat.view', 'secretariat.create_letter', 'secretariat.edit_letter']);

        $letter = WorkspaceRecord::query()->create([
            'kind' => WorkspaceRecord::KIND_LETTER,
            'title' => 'نامه وارده شماره ۱۰۰',
            'status' => 'new',
            'owner_id' => $author->id,
            'payload' => [
                'title' => 'نامه وارده شماره ۱۰۰',
                'status' => 'new',
                'senderUserId' => (string) $author->id,
                'referrals' => [],
                'updatedAt' => '1400/01/01',
            ],
        ]);

        $referrer = $this->actingAsUser('letter_referrer', ['secretariat.view', 'secretariat.refer_letter']);

        $this->putJson("/api/v1/secretariat-letters/{$letter->id}", [
            'title' => 'نامه وارده شماره ۱۰۰',
            'status' => 'referred',
            'senderUserId' => (string) $author->id,
            'referrals' => [['toUserId' => '2', 'instructions' => 'جهت اقدام']],
            'updatedAt' => '1400/01/02',
        ])->assertOk();

        // تغییر موضوع نامه با دسترسی ارجاع → مجاز نیست.
        $this->putJson("/api/v1/secretariat-letters/{$letter->id}", [
            'title' => 'تغییر موضوع بدون مجوز ویرایش',
            'status' => 'referred',
            'referrals' => [],
            'updatedAt' => '1400/01/03',
        ])->assertForbidden();

        $archiver = $this->actingAsUser('letter_archiver', ['secretariat.view', 'secretariat.archive_letter']);

        // فقط فیلدهای بایگانی تغییر می‌کنند؛ referrals همان مقدار فعلی می‌ماند.
        $this->putJson("/api/v1/secretariat-letters/{$letter->id}", [
            'title' => 'نامه وارده شماره ۱۰۰',
            'status' => 'archived',
            'archiveDossierId' => '12',
            'archiveBox' => 'B-1',
            'referrals' => [['toUserId' => '2', 'instructions' => 'جهت اقدام']],
            'updatedAt' => '1400/01/04',
        ])->assertOk();
    }

    public function test_letter_deletion_requires_delete_letter_permission(): void
    {
        $author = $this->actingAsUser('letter_author', ['secretariat.view', 'secretariat.create_letter', 'secretariat.edit_letter']);

        $letter = WorkspaceRecord::query()->create([
            'kind' => WorkspaceRecord::KIND_LETTER,
            'title' => 'نامه قابل حذف',
            'status' => 'new',
            'owner_id' => $author->id,
            'payload' => ['title' => 'نامه قابل حذف', 'status' => 'new'],
        ]);

        // ویرایش‌گر نامه حق حذف ندارد؛ حذف مستلزم secretariat.delete_letter است.
        $this->deleteJson("/api/v1/secretariat-letters/{$letter->id}")->assertForbidden();

        $deleter = $this->actingAsUser('letter_deleter', ['secretariat.view', 'secretariat.delete_letter']);

        $this->deleteJson("/api/v1/secretariat-letters/{$letter->id}")->assertNoContent();
    }

    public function test_system_settings_require_management_permission(): void
    {
        $this->actingAsUser('settings_manager', ['settings.manage']);

        $this->putJson('/api/v1/settings/general', [
            'value' => ['orgName' => 'سازمان نمونه', 'workspaceSlug' => 'sample-org'],
        ])->assertOk()
            ->assertJsonPath('data.value.orgName', 'سازمان نمونه')
            ->assertJsonPath('data.value.timezone', 'Asia/Tehran');
        $this->putJson('/api/v1/settings/target_audiences', [
            'value' => ['عموم جامعه', 'مدیران'],
        ])->assertOk()->assertJsonPath('data.value.1', 'مدیران');
        $this->putJson('/api/v1/settings/target_audiences', [
            'value' => ['تکراری', 'تکراری'],
        ])->assertUnprocessable();
        $this->putJson('/api/v1/settings/target_audiences', [
            'value' => ['معتبر', ''],
        ])->assertUnprocessable();

        $this->actingAsUser('plain_user', ['projects.view']);

        $this->putJson('/api/v1/settings/security', [
            'value' => ['twoFactorEnforced' => true],
        ])->assertForbidden();

        // خواندن تنظیمات برای همه کاربران احراز هویت‌شده آزاد است.
        $this->getJson('/api/v1/settings')
            ->assertOk()
            ->assertJsonPath('data.general.orgName', 'سازمان نمونه');
    }

    public function test_task_endpoints_require_task_permissions(): void
    {
        $viewer = $this->actingAsUser('task_viewer', ['tasks.view']);

        $this->getJson('/api/v1/tasks')->assertOk();
        $this->postJson('/api/v1/tasks', [
            'title' => 'وظیفه بدون مجوز',
            'status' => 'todo',
            'priority' => 'low',
        ])->assertForbidden();

        $creator = $this->actingAsUser('task_creator', ['tasks.view', 'tasks.create', 'tasks.status']);

        $taskResponse = $this->postJson('/api/v1/tasks', [
            'title' => 'وظیفه مجاز',
            'status' => 'todo',
            'priority' => 'low',
            'assigneeId' => (string) $creator->id,
        ])->assertCreated();

        $taskId = $taskResponse->json('data.id');

        $this->patchJson("/api/v1/tasks/{$taskId}/status", ['status' => 'in_progress'])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_progress');

        Sanctum::actingAs($viewer);
        $this->deleteJson("/api/v1/tasks/{$taskId}")->assertForbidden();
    }
}
