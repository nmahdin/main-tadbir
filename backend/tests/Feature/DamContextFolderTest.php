<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamFolder;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * «انتقال ضمیمه به پوشهٔ این بخش»: دارایی موجودی که از مخزن به ضمیمه‌های یک
 * محتوا/ایده/جلسه وصل می‌شود می‌تواند به همان پوشهٔ پیش‌فرضی برود که آپلود تازه
 * در آن بخش استفاده می‌کند.
 */
class DamContextFolderTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    /** @param  array<int, string>  $keys */
    private function actor(array $keys, string $roleKey = 'dam_member'): User
    {
        $role = Role::create(['key' => $roleKey, 'name' => $roleKey, 'color' => '#000000', 'is_system' => false, 'is_active' => true]);
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'dam']);
            $role->permissions()->attach($permission);
        }
        $user = User::factory()->create(['role_id' => $role->id, 'role_key' => $roleKey]);
        Sanctum::actingAs($user);

        return $user;
    }

    private static int $uploadSeq = 0;

    /**
     * هر آپلود محتوای یکتا دارد؛ وگرنه نگهبانِ «فایل مشابه» با ۴۰۹ جلوی
     * آپلود دوم را می‌گیرد و آزمون به‌جای پوشهٔ بافت، رفتار تکرار را می‌سنجد.
     */
    private function asset(string $title = 'Report'): int
    {
        $seq = ++self::$uploadSeq;

        return (int) $this->post('/api/v1/dam/library', [
            'title' => $title,
            'file' => UploadedFile::fake()->createWithContent('report-'.$seq.'.pdf', 'asset-content-'.$seq.'-'.$title),
        ])->assertCreated()->json('data.id');
    }

    /** مسیر پوشه از ریشه تا خودِ آن، برای مقایسه با مسیر پیش‌فرض آپلود. */
    private function folderPath(int $folderId): array
    {
        $names = [];
        $cursor = DamFolder::find($folderId);
        $guard = 0;
        while ($cursor && $guard++ < 20) {
            array_unshift($names, $cursor->name);
            $cursor = $cursor->parent_id ? DamFolder::find($cursor->parent_id) : null;
        }

        return $names;
    }

    private function content(User $owner, string $code = 'CNT-1'): Content
    {
        return Content::create([
            'title' => 'محتوا نمونه',
            'code' => $code,
            'type' => 'article',
            'status' => 'idea',
            'owner_id' => $owner->id,
            'payload' => ['stages' => []],
        ]);
    }

    public function test_attached_library_asset_moves_into_the_content_attachment_folder(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'assets.move']);
        $assetId = $this->asset();
        $content = $this->content($actor);

        $response = $this->postJson('/api/v1/dam/library/'.$assetId.'/context-folder', [
            'content_id' => $content->id,
        ])->assertOk()->assertJsonPath('data.moved', true);

        $asset = DamAsset::findOrFail($assetId);
        $folder = DamFolder::findOrFail($asset->folder_id);
        // همان مسیر خودکار آپلود تازه: محتواها / عمومی - کد / پیوست‌های دیگر.
        $this->assertSame(['محتواها', 'عمومی - CNT-1', 'پیوست‌های دیگر'], $this->folderPath((int) $folder->id));
        $this->assertSame($folder->id, $response->json('data.folder.id'));
        // رخداد جابه‌جایی در تاریخچهٔ دارایی ثبت می‌شود.
        $this->assertDatabaseHas('dam_activities', ['asset_id' => $assetId, 'action' => 'moved']);

        // بار دوم: تغییری لازم نیست و همان پوشه گزارش می‌شود.
        $this->postJson('/api/v1/dam/library/'.$assetId.'/context-folder', ['content_id' => $content->id])
            ->assertOk()->assertJsonPath('data.moved', false)->assertJsonPath('data.unchanged', true);
    }

    public function test_output_bucket_uses_the_outputs_folder(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'assets.move']);
        $assetId = $this->asset();
        $content = $this->content($actor, 'CNT-2');

        $this->postJson('/api/v1/dam/library/'.$assetId.'/context-folder', [
            'content_id' => $content->id,
            'content_bucket' => 'outputs',
        ])->assertOk()->assertJsonPath('data.moved', true);

        $this->assertSame(['محتواها', 'عمومی - CNT-2', 'خروجی‌ها'], $this->folderPath((int) DamAsset::findOrFail($assetId)->folder_id));
    }

    public function test_idea_and_meeting_folders_are_used_for_their_own_sections(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'assets.move', 'thinktank.view', 'meetings.view']);
        $idea = WorkspaceRecord::create([
            'kind' => WorkspaceRecord::KIND_IDEA,
            'title' => 'ایده نمونه',
            'owner_id' => $actor->id,
            'payload' => ['status' => 'submitted'],
        ]);
        $ideaAsset = $this->asset('Idea file');
        $this->postJson('/api/v1/dam/library/'.$ideaAsset.'/context-folder', ['idea_id' => $idea->id])
            ->assertOk()->assertJsonPath('data.moved', true);
        $this->assertSame(
            ['ایده‌ها', (string) $idea->id, 'فایل'],
            $this->folderPath((int) DamAsset::findOrFail($ideaAsset)->folder_id),
        );

        $meeting = WorkspaceRecord::create([
            'kind' => WorkspaceRecord::KIND_MEETING,
            'title' => 'جلسه نمونه',
            'owner_id' => $actor->id,
            'payload' => ['attendeeIds' => [(string) $actor->id]],
        ]);
        $meetingAsset = $this->asset('Meeting file');
        $this->postJson('/api/v1/dam/library/'.$meetingAsset.'/context-folder', ['meeting_id' => $meeting->id])
            ->assertOk()->assertJsonPath('data.moved', true);
        $this->assertSame(
            ['جلسات', 'جلسه نمونه', 'فایل'],
            $this->folderPath((int) DamAsset::findOrFail($meetingAsset)->folder_id),
        );
    }

    public function test_moving_requires_the_move_permission_and_a_resolvable_context(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info']);
        $assetId = $this->asset();
        $content = $this->content($actor);

        $this->postJson('/api/v1/dam/library/'.$assetId.'/context-folder', ['content_id' => $content->id])
            ->assertForbidden();
        // دارایی در همان پوشهٔ اولیه می‌ماند.
        $this->assertNull(DamAsset::findOrFail($assetId)->folder_id);

        // با مجوز جابه‌جایی، نبودِ زمینهٔ مقصد دلیل روشن می‌گیرد.
        $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'assets.move'], 'dam_mover');
        $this->postJson('/api/v1/dam/library/'.$assetId.'/context-folder', [])
            ->assertStatus(422)->assertJsonPath('message', 'زمینهٔ مقصد برای پوشهٔ این بخش مشخص نیست.');
    }

    public function test_content_of_another_owner_cannot_be_used_as_the_destination(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'assets.move']);
        $assetId = $this->asset();
        $stranger = User::factory()->create(['status' => 'active']);
        $content = $this->content($stranger);

        $this->postJson('/api/v1/dam/library/'.$assetId.'/context-folder', ['content_id' => $content->id])
            ->assertForbidden();
    }
}
