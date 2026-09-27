<?php
namespace Tests\Feature;

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
        $this->actor(['assets.view','assets.upload','assets.edit_info','projects.view']);
        $one = \App\Models\Project::create(['name'=>'One','key'=>'ONE']);
        $two = \App\Models\Project::create(['name'=>'Two','key'=>'TWO']);
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
        $this->actor(['assets.view', 'assets.upload', 'assets.move', 'projects.view']);
        $project = \App\Models\Project::create(['name' => 'Central', 'key' => 'CENTRAL']);
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
