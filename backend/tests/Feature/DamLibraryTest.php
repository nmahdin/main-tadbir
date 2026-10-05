<?php
namespace Tests\Feature;

use App\Models\Content;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DamLibraryTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $keys, string $roleKey = 'member'): User
    {
        $role = Role::create(['key'=>$roleKey,'name'=>$roleKey,'color'=>'#000000','is_system'=>false,'is_active'=>true]);
        foreach ($keys as $key) {
            $permission = Permission::firstOrCreate(['key'=>$key], ['label'=>$key,'category'=>'dam']);
            $role->permissions()->attach($permission);
        }
        $user = User::factory()->create(['role_id'=>$role->id,'role_key'=>$roleKey]);
        Sanctum::actingAs($user);
        return $user;
    }

    public function test_private_file_upload_download_and_confidential_scope(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.view','assets.upload','assets.download']);
        $response = $this->post('/api/v1/dam/library', [
            'title'=>'Private document', 'confidentiality'=>'confidential',
            'file'=>UploadedFile::fake()->create('report.pdf', 5, 'application/pdf'),
        ])->assertCreated()->assertJsonPath('data.type','file');
        $id = $response->json('data.id');
        $path = \App\Models\DamAsset::findOrFail($id)->latestFile->storage_path;
        Storage::disk('local')->assertExists($path);
        $this->get('/api/v1/dam/library/'.$id.'/download')->assertOk();
        $this->getJson('/api/v1/dam/library')->assertJsonCount(1, 'data');

        $other = $this->actor(['assets.view','assets.download'], 'other');
        $this->getJson('/api/v1/dam/library')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/dam/library/'.$id)->assertForbidden();
        $this->get('/api/v1/dam/library/'.$id.'/download')->assertForbidden();
        $this->assertNotEquals($owner->id, $other->id);
    }

    public function test_preview_is_private_and_requires_preview_permission(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.preview']);
        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'Preview PDF',
            'file' => UploadedFile::fake()->create('preview.pdf', 5, 'application/pdf'),
        ])->assertCreated()->json('data.id');
        $this->get('/api/v1/dam/library/'.$assetId.'/preview')->assertOk();

        $this->actor(['assets.view'], 'reader');
        $this->get('/api/v1/dam/library/'.$assetId.'/preview')->assertForbidden();
    }

    public function test_text_is_persisted_and_searchable_without_file(): void
    {
        $this->actor(['assets.view','assets.upload']);
        $id = $this->postJson('/api/v1/dam/library', [
            'title'=>'History', 'body'=>'روایت تاریخی امروز',
        ])->assertCreated()->assertJsonPath('data.type','content')->json('data.id');
        $this->getJson('/api/v1/dam/library?search='.urlencode('تاریخی'))
            ->assertOk()->assertJsonPath('data.0.id', $id);
        $this->getJson('/api/v1/dam/library/'.$id)->assertJsonPath('data.content_item.content_body', 'روایت تاریخی امروز');
    }

    public function test_rich_text_is_sanitized_and_plain_text_is_derived_on_the_server(): void
    {
        $this->actor(['assets.view', 'assets.upload']);
        $id = $this->postJson('/api/v1/dam/library', [
            'title' => 'Rich note',
            'body' => '<h2 style="color: #1e3a8a; position: fixed">عنوان</h2><p onclick="alert(1)"><strong>متن</strong><script>alert(2)</script></p>',
        ])->assertCreated()->json('data.id');

        $this->getJson('/api/v1/dam/library/'.$id)->assertOk()
            ->assertJsonPath('data.content_item.content_format', 'html')
            ->assertJsonPath('data.content_item.content_body', '<h2 style="color: #1e3a8a">عنوان</h2><p><strong>متن</strong></p>')
            ->assertJsonPath('data.content_item.content_plain_text', "عنوان\nمتن");
    }

    public function test_precreated_idea_attachment_uses_a_stable_managed_folder_path(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'thinktank.view', 'thinktank.create_idea']);
        $ideaKey = 'be7b98a1-0771-4bb8-8184-d1ba4b402535';

        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'Idea attachment',
            'idea_title' => 'ایده آزمایشی',
            'idea_key' => $ideaKey,
            'file' => UploadedFile::fake()->create('idea.pdf', 5, 'application/pdf'),
        ])->assertCreated()->json('data.id');

        $root = \App\Models\DamFolder::query()->where('system_key', 'ideas-root')->firstOrFail();
        $idea = \App\Models\DamFolder::query()->where('system_key', 'idea:'.$ideaKey)->firstOrFail();
        $files = \App\Models\DamFolder::query()->where('system_key', 'idea:'.$ideaKey.':files')->firstOrFail();
        $this->assertSame('ایده‌ها', $root->name);
        $this->assertSame('ایده آزمایشی', $idea->name);
        $this->assertSame($root->id, $idea->parent_id);
        $this->assertSame('فایل', $files->name);
        $this->assertSame($idea->id, $files->parent_id);
        $this->assertDatabaseHas('dam_assets', ['folder_id' => $files->id]);
        $this->assertDatabaseCount('dam_relations', 0);

        $ideaRecord = \App\Models\WorkspaceRecord::create([
            'kind' => \App\Models\WorkspaceRecord::KIND_IDEA,
            'client_request_id' => $ideaKey,
            'title' => 'ایده آزمایشی',
            'status' => 'submitted',
            'owner_id' => $actor->id,
            'payload' => [],
        ]);
        $this->postJson('/api/v1/dam/library/'.$assetId.'/relations', [
            'related_type' => 'idea',
            'related_id' => $ideaRecord->id,
        ])->assertOk();

        $idFolder = \App\Models\DamFolder::query()->where('system_key', 'idea:'.$ideaRecord->id)->firstOrFail();
        $idFiles = \App\Models\DamFolder::query()->where('system_key', 'idea:'.$ideaRecord->id.':files')->firstOrFail();
        $this->assertSame((string) $ideaRecord->id, $idFolder->name);
        $this->assertDatabaseHas('dam_assets', ['id' => $assetId, 'folder_id' => $idFiles->id]);
        $this->assertStringContainsString('dam/ایدهها/'.$ideaRecord->id.'/فایل/', \App\Models\DamAsset::findOrFail($assetId)->latestFile->storage_path);
    }

    public function test_project_meeting_and_idea_assets_use_context_relations_and_managed_file_folders(): void
    {
        Storage::fake('local');
        $actor = $this->actor([
            'assets.view', 'assets.upload', 'assets.edit_info',
            'projects.view', 'thinktank.view', 'meetings.view',
        ]);
        $project = \App\Models\Project::create(['name' => 'پروژه راهبردی', 'project_manager_id' => $actor->id]);
        $idea = \App\Models\WorkspaceRecord::create([
            'kind' => \App\Models\WorkspaceRecord::KIND_IDEA,
            'title' => 'ایده متصل',
            'status' => 'draft',
            'owner_id' => $actor->id,
            'payload' => [],
        ]);
        $meeting = \App\Models\WorkspaceRecord::create([
            'kind' => \App\Models\WorkspaceRecord::KIND_MEETING,
            'title' => 'جلسه راهبردی',
            'status' => 'scheduled',
            'owner_id' => $actor->id,
            'payload' => [],
        ]);

        $projectAsset = $this->post('/api/v1/dam/library', [
            'title' => 'فایل پروژه',
            'project_id' => $project->id,
            'file' => UploadedFile::fake()->create('project.pdf', 2, 'application/pdf'),
        ])->assertCreated()->json('data.id');
        $meetingAsset = $this->post('/api/v1/dam/library', [
            'title' => 'فایل جلسه',
            'meeting_id' => $meeting->id,
            'duplicate_action' => 'create',
            'file' => UploadedFile::fake()->create('meeting.pdf', 2, 'application/pdf'),
        ])->assertCreated()->json('data.id');
        $ideaAsset = $this->post('/api/v1/dam/library', [
            'title' => 'فایل ایده',
            'idea_id' => $idea->id,
            'duplicate_action' => 'create',
            'file' => UploadedFile::fake()->create('idea-linked.pdf', 2, 'application/pdf'),
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('dam_relations', ['asset_id' => $projectAsset, 'related_type' => 'project', 'related_id' => $project->id]);
        $this->assertDatabaseHas('dam_relations', ['asset_id' => $meetingAsset, 'related_type' => 'meeting', 'related_id' => $meeting->id]);
        $this->assertDatabaseHas('dam_relations', ['asset_id' => $ideaAsset, 'related_type' => 'idea', 'related_id' => $idea->id]);
        $this->getJson('/api/v1/dam/library?meeting_id='.$meeting->id)->assertOk()->assertJsonPath('data.0.id', $meetingAsset);
        $this->getJson('/api/v1/dam/library?idea_id='.$idea->id)->assertOk()->assertJsonPath('data.0.id', $ideaAsset);

        $projectFiles = \App\Models\DamFolder::where('system_key', 'project:'.$project->id.':files')->firstOrFail();
        $meetingFiles = \App\Models\DamFolder::where('system_key', 'meeting:'.$meeting->id.':files')->firstOrFail();
        $ideaFolder = \App\Models\DamFolder::where('system_key', 'idea:'.$idea->id)->firstOrFail();
        $ideaFiles = \App\Models\DamFolder::where('system_key', 'idea:'.$idea->id.':files')->firstOrFail();
        $this->assertSame('فایل', $projectFiles->name);
        $this->assertSame('فایل', $meetingFiles->name);
        $this->assertSame((string) $idea->id, $ideaFolder->name);
        $this->assertSame($ideaFolder->id, $ideaFiles->parent_id);
        $this->assertStringContainsString('dam/پروژهها/پروژه راهبردی/فایل/', \App\Models\DamAsset::findOrFail($projectAsset)->latestFile->storage_path);
        $this->assertStringContainsString('dam/جلسات/جلسه راهبردی/فایل/', \App\Models\DamAsset::findOrFail($meetingAsset)->latestFile->storage_path);
        $this->assertStringContainsString('dam/ایدهها/'.$idea->id.'/فایل/', \App\Models\DamAsset::findOrFail($ideaAsset)->latestFile->storage_path);

        $project->update(['name' => 'پروژه تغییرنام‌یافته']);
        app(\App\Services\DamService::class)->syncProjectFolderName($project->fresh());
        $meeting->update(['title' => 'جلسه تغییرنام‌یافته']);
        app(\App\Services\DamService::class)->syncWorkspaceFolderName($meeting->fresh());
        $this->assertDatabaseHas('dam_folders', ['system_key' => 'project:'.$project->id, 'name' => 'پروژه تغییرنام‌یافته']);
        $this->assertDatabaseHas('dam_folders', ['system_key' => 'meeting:'.$meeting->id, 'name' => 'جلسه تغییرنام‌یافته']);
    }

    public function test_archived_asset_can_be_permanently_deleted_with_its_private_file(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload', 'assets.delete']);
        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'حذف نهایی',
            'file' => UploadedFile::fake()->create('delete-me.pdf', 2, 'application/pdf'),
        ])->assertCreated()->json('data.id');
        $path = \App\Models\DamAsset::findOrFail($assetId)->latestFile->storage_path;

        $this->deleteJson('/api/v1/dam/library/'.$assetId.'/force')->assertNotFound();
        $this->deleteJson('/api/v1/dam/library/'.$assetId)->assertNoContent();
        $this->getJson('/api/v1/dam/library?status=deleted')->assertOk()->assertJsonPath('data.0.id', $assetId);
        $this->deleteJson('/api/v1/dam/library/'.$assetId.'/force')->assertNoContent();

        $this->assertDatabaseMissing('dam_assets', ['id' => $assetId]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_version_restore_keeps_previous_file_and_records_activity(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view','assets.upload','assets.download','assets.create_version','assets.restore']);
        $id = $this->post('/api/v1/dam/library', [
            'title'=>'Versioned','file'=>UploadedFile::fake()->createWithContent('first.txt', 'first'),
        ])->assertCreated()->json('data.id');
        $this->post('/api/v1/dam/library/'.$id.'/versions', [
            'file'=>UploadedFile::fake()->createWithContent('second.txt', 'second'),
            'change_description'=>'New draft',
        ])->assertOk()->assertJsonCount(2, 'data.versions');
        $this->postJson('/api/v1/dam/library/'.$id.'/versions/1/restore')->assertOk()
            ->assertJsonPath('data.latest_file.original_filename','first.txt')
            ->assertJsonCount(3, 'data.versions');
        $asset = \App\Models\DamAsset::findOrFail($id);
        $this->assertCount(2, $asset->files);
        foreach ($asset->files as $file) Storage::disk('local')->assertExists($file->storage_path);
        $this->assertDatabaseHas('dam_activities', ['asset_id'=>$id,'action'=>'version_restored']);
    }

    public function test_content_revision_preserves_prior_snapshot(): void
    {
        $this->actor(['assets.view','assets.upload','assets.edit_info','assets.restore']);
        $id = $this->postJson('/api/v1/dam/library', ['title'=>'Note','body'=>'First text'])
            ->assertCreated()->json('data.id');
        $this->postJson('/api/v1/dam/library/'.$id.'/versions', ['body'=>'Second text'])
            ->assertOk()->assertJsonPath('data.content_item.content_body','Second text');
        $this->postJson('/api/v1/dam/library/'.$id.'/versions/1/restore')
            ->assertOk()->assertJsonPath('data.content_item.content_body','First text');
    }

    public function test_asset_can_link_to_multiple_projects_without_duplicate_file(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view','assets.upload','assets.edit_info','projects.view']);
        $one = \App\Models\Project::create(['name' => 'One', 'project_manager_id' => $actor->id]);
        $two = \App\Models\Project::create(['name' => 'Two', 'project_manager_id' => $actor->id]);
        $id = $this->post('/api/v1/dam/library', [
            'title'=>'Shared file', 'project_id'=>$one->id,
            'file'=>UploadedFile::fake()->create('shared.pdf', 5, 'application/pdf'),
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/dam/library/{$id}/relations", [
            'related_type'=>'project', 'related_id'=>$two->id,
        ])->assertOk();
        $this->getJson('/api/v1/dam/library?project_id='.$one->id)->assertJsonPath('data.0.id',$id);
        $this->getJson('/api/v1/dam/library?project_id='.$two->id)->assertJsonPath('data.0.id',$id);
        $this->assertDatabaseCount('dam_files', 1);
        $this->assertDatabaseCount('dam_relations', 2);
    }

    public function test_validation_rejects_oversized_and_executable_uploads_without_creating_assets(): void
    {
        Storage::fake('local');
        $this->actor(['assets.upload']);
        $this->post('/api/v1/dam/library', [
            'title'=>'Too large', 'file'=>UploadedFile::fake()->create('huge.pdf', 20481),
        ], ['Accept'=>'application/json'])->assertUnprocessable();
        $this->post('/api/v1/dam/library', [
            'title'=>'Script', 'file'=>UploadedFile::fake()->create('bad.php', 1),
        ], ['Accept'=>'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('dam_assets', 0);
    }

    public function test_folder_root_filter_and_summary_use_real_private_assets(): void
    {
        Storage::fake('local');
        $this->actor(['assets.view', 'assets.upload']);
        $this->post('/api/v1/dam/library', [
            'title' => 'Root file', 'file' => UploadedFile::fake()->create('root.txt', 1, 'text/plain'),
        ])->assertCreated();
        $folder = $this->postJson('/api/v1/dam/library/folders', ['name' => 'Archive'])->assertCreated()->json('data.id');
        $this->post('/api/v1/dam/library', [
            'title' => 'Folder file', 'folder_id' => $folder,
            'duplicate_action' => 'create',
            'file' => UploadedFile::fake()->create('folder.txt', 1, 'text/plain'),
        ])->assertCreated();

        $this->getJson('/api/v1/dam/library?folder_id=0')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/dam/library/summary')->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.files', 2)
            ->assertJsonPath('data.folders', 1);
    }

    public function test_bulk_move_preserves_asset_and_project_relation_and_logs_activity(): void
    {
        Storage::fake('local');
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.move', 'projects.view']);
        $project = \App\Models\Project::create(['name' => 'Central', 'project_manager_id' => $actor->id]);
        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'Move me', 'project_id' => $project->id,
            'file' => UploadedFile::fake()->create('move.txt', 1, 'text/plain'),
        ])->assertCreated()->json('data.id');
        $folderId = $this->postJson('/api/v1/dam/library/folders', ['name' => 'Target'])->assertCreated()->json('data.id');

        $this->postJson('/api/v1/dam/library/bulk/move', ['ids' => [$assetId], 'folder_id' => $folderId])->assertOk();
        $this->getJson('/api/v1/dam/library?project_id='.$project->id.'&folder_id='.$folderId)
            ->assertOk()->assertJsonPath('data.0.id', $assetId);
        $this->assertDatabaseHas('dam_activities', ['asset_id' => $assetId, 'action' => 'moved']);
        $this->assertDatabaseCount('dam_files', 1);
    }

    public function test_content_participant_can_list_preview_and_download_only_linked_assets(): void
    {
        Storage::fake('local');
        $member = $this->actor([], 'content-member');
        $owner = $this->actor(['assets.view', 'assets.upload', 'assets.preview', 'assets.download'], 'asset-owner');
        $content = Content::create([
            'title' => 'محتوای اعضا',
            'type' => 'article',
            'status' => 'in_progress',
            'owner_id' => $owner->id,
            'payload' => ['editorIds' => [(string) $member->id]],
        ]);
        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'فایل محرمانه محتوا',
            'content_id' => $content->id,
            'confidentiality' => 'confidential',
            'file' => UploadedFile::fake()->create('content.pdf', 2, 'application/pdf'),
        ])->assertCreated()->json('data.id');
        $foreign = Content::create([
            'title' => 'محتوای دیگر',
            'type' => 'article',
            'status' => 'in_progress',
            'owner_id' => $owner->id,
            'payload' => [],
        ]);

        Sanctum::actingAs($member->fresh());
        $this->getJson('/api/v1/dam/library?content_id='.$content->id)
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $assetId);
        $this->getJson('/api/v1/dam/library/'.$assetId)->assertOk();
        $this->get('/api/v1/dam/library/'.$assetId.'/preview')->assertOk();
        $this->get('/api/v1/dam/library/'.$assetId.'/download')->assertOk();
        $this->getJson('/api/v1/dam/library')->assertForbidden();
        $this->getJson('/api/v1/dam/library?content_id='.$foreign->id)->assertForbidden();
    }

    public function test_content_assets_use_exact_visual_folders_and_real_storage_paths(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.view', 'assets.upload']);
        $content = Content::create([
            'title' => 'گزارش ماهانه',
            'type' => 'article',
            'status' => 'in_progress',
            'owner_id' => $owner->id,
            'payload' => [],
        ]);

        $attachment = $this->post('/api/v1/dam/library', [
            'title' => 'پیوست گزارش',
            'content_id' => $content->id,
            'content_bucket' => 'attachments',
            'file' => UploadedFile::fake()->create('attachment.txt', 1, 'text/plain'),
        ])->assertCreated()->json('data.id');
        $output = $this->post('/api/v1/dam/library', [
            'title' => 'خروجی گزارش',
            'content_id' => $content->id,
            'content_bucket' => 'outputs',
            'duplicate_action' => 'create',
            'file' => UploadedFile::fake()->create('output.txt', 1, 'text/plain'),
        ])->assertCreated()->json('data.id');
        $selectedFolder = \App\Models\DamFolder::create(['name' => 'مقصد انتخابی', 'created_by' => $owner->id]);
        $customOutput = $this->post('/api/v1/dam/library', [
            'title' => 'خروجی با مقصد دستی',
            'content_id' => $content->id,
            'content_bucket' => 'outputs',
            'folder_id' => $selectedFolder->id,
            'duplicate_action' => 'create',
            'file' => UploadedFile::fake()->create('custom-output.txt', 1, 'text/plain'),
        ])->assertCreated()->assertJsonPath('data.folder_id', $selectedFolder->id)->json('data.id');

        $this->assertDatabaseHas('dam_folders', ['name' => 'محتواها', 'parent_id' => null]);
        $this->assertDatabaseHas('dam_folders', ['name' => 'پیوست‌های دیگر']);
        $this->assertDatabaseHas('dam_folders', ['name' => 'خروجی‌ها']);
        $attachmentPath = \App\Models\DamAsset::findOrFail($attachment)->latestFile->storage_path;
        $outputPath = \App\Models\DamAsset::findOrFail($output)->latestFile->storage_path;
        $customOutputPath = \App\Models\DamAsset::findOrFail($customOutput)->latestFile->storage_path;
        // Visible labels keep their ZWNJ; private physical paths remove Unicode
        // format characters that Flysystem rejects.
        $this->assertStringContainsString('dam/محتواها/عمومی - کد عمومی/پیوستهای دیگر/', $attachmentPath);
        $this->assertStringContainsString('dam/محتواها/عمومی - کد عمومی/خروجیها/', $outputPath);
        $this->assertStringContainsString('dam/مقصد انتخابی/', $customOutputPath);
        $this->assertStringNotContainsString('/خروجی‌ها/', $customOutputPath);

        $series = \App\Models\ContentSeries::create([
            'name' => 'گزارش‌های دوره‌ای', 'code_prefix' => 'MONTHLY', 'content_type' => 'article',
            'owner_id' => $owner->id, 'created_by' => $owner->id, 'status' => 'active',
            'recurrence_type' => 'manual', 'recurrence_config' => [], 'default_content_payload' => [],
            'default_publication_config' => [],
        ]);
        $seriesContent = Content::create([
            'title' => 'گزارش مجموعه', 'type' => 'article', 'status' => 'in_progress',
            'owner_id' => $owner->id, 'series_id' => $series->id, 'payload' => [],
        ]);
        $seriesInput = $this->post('/api/v1/dam/library', [
            'title' => 'ورودی مجموعه', 'content_id' => $seriesContent->id, 'content_bucket' => 'inputs',
            'duplicate_action' => 'create', 'file' => UploadedFile::fake()->create('series-input.txt', 1, 'text/plain'),
        ])->assertCreated()->json('data.id');
        $seriesInputPath = \App\Models\DamAsset::findOrFail($seriesInput)->latestFile->storage_path;
        $this->assertStringContainsString('dam/محتواها/گزارشهای دورهای - MONTHLY/ورودیها/', $seriesInputPath);

        Storage::disk('local')->assertExists($attachmentPath);
        Storage::disk('local')->assertExists($outputPath);
        Storage::disk('local')->assertExists($seriesInputPath);
    }

    public function test_summary_reports_organization_wide_file_usage_against_organization_quota(): void
    {
        Storage::fake('local');
        $first = $this->actor(['assets.view', 'assets.upload'], 'first-owner');
        $this->post('/api/v1/dam/library', [
            'title' => 'Visible',
            'file' => UploadedFile::fake()->create('visible.txt', 1, 'text/plain'),
        ])->assertCreated();
        $this->actor(['assets.view', 'assets.upload'], 'second-owner');
        $this->post('/api/v1/dam/library', [
            'title' => 'Restricted',
            'confidentiality' => 'confidential',
            'duplicate_action' => 'create',
            'file' => UploadedFile::fake()->create('restricted.txt', 2, 'text/plain'),
        ])->assertCreated();

        Sanctum::actingAs($first->fresh());
        $this->getJson('/api/v1/dam/library/summary')->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.storage_bytes', 3 * 1024)
            ->assertJsonPath('data.storage_limit_bytes', (int) config('dam.storage_quota_bytes'));
    }

    public function test_new_assets_default_to_approved_and_receive_context_category(): void
    {
        $this->actor(['assets.view', 'assets.upload', 'tasks.view']);
        $task = \App\Models\Task::create(['title' => 'Categorized task', 'status' => 'backlog']);

        $assetId = $this->postJson('/api/v1/dam/library', [
            'title' => 'Task note', 'body' => 'text', 'task_id' => $task->id,
        ])->assertCreated()->assertJsonPath('data.status', 'approved')->json('data.id');

        $asset = \App\Models\DamAsset::with('category')->findOrFail($assetId);
        $this->assertSame('approved', $asset->status);
        $this->assertSame('وظایف', $asset->category?->name);
    }

    public function test_temporary_file_links_are_authorized_copyable_and_expire_after_two_hours(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.view', 'assets.upload', 'assets.preview', 'assets.download']);
        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'Temporary file',
            'file' => UploadedFile::fake()->create('temporary.txt', 2, 'text/plain'),
        ])->assertCreated()->json('data.id');

        $this->actor(['assets.view'], 'link-reader');
        $this->postJson("/api/v1/dam/library/{$assetId}/temporary-link", ['mode' => 'download'])->assertForbidden();
        Sanctum::actingAs($owner);

        $link = $this->postJson("/api/v1/dam/library/{$assetId}/temporary-link", ['mode' => 'download'])
            ->assertOk()->assertJsonPath('data.expires_in', 7200)->json('data.url');
        $this->get($link)->assertOk();
        $this->travel(2)->hours();
        $this->travel(1)->seconds();
        $this->get($link)->assertForbidden();
    }

    public function test_host_storage_path_is_visible_only_to_global_administrators(): void
    {
        Storage::fake('local');
        $manager = $this->actor(['assets.view', 'assets.upload', 'assets.manage_access'], 'asset-manager');
        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'Host path',
            'file' => UploadedFile::fake()->create('path.txt', 1, 'text/plain'),
        ])->assertCreated()->json('data.id');
        $this->getJson("/api/v1/dam/library/{$assetId}")->assertOk()
            ->assertJsonMissingPath('data.latest_file.storage_path')
            ->assertJsonMissingPath('data.storage_root');

        $admin = $this->actor(['assets.view'], 'admin');
        $this->assertNotSame($manager->id, $admin->id);
        $this->getJson("/api/v1/dam/library/{$assetId}")->assertOk()
            ->assertJsonPath('data.latest_file.storage_path', fn ($value) => is_string($value) && $value !== '')
            ->assertJsonPath('data.storage_root', fn ($value) => is_string($value));
    }

    public function test_unauthenticated_library_is_rejected(): void
    {
        $this->getJson('/api/v1/dam/library')->assertUnauthorized();
    }

    public function test_legacy_metadata_only_asset_creation_is_blocked(): void
    {
        $this->actor(['assets.upload']);
        $this->postJson('/api/v1/dam/assets', ['title'=>'Metadata only', 'fileName'=>'not-real.pdf'])
            ->assertStatus(410);
        $this->assertDatabaseCount('domain_records', 0);
    }

    public function test_write_is_denied_without_upload_permission(): void
    {
        $this->actor(['assets.view']);
        $this->postJson('/api/v1/dam/library', ['title'=>'Denied','body'=>'Some text'])->assertForbidden();
    }
}
