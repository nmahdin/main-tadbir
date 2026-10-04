<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DamFolder;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DamHardeningFeatureTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(array $permissions, string $key = 'dam_hardening'): User
    {
        $role = Role::create(['key' => $key.'_'.bin2hex(random_bytes(3)), 'name' => $key, 'is_active' => true]);
        foreach ($permissions as $permission) {
            $role->permissions()->attach(Permission::firstOrCreate(
                ['key' => $permission],
                ['label' => $permission, 'category' => 'tests'],
            ));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function content(User $owner, string $code = 'RV130'): Content
    {
        return Content::create([
            'title' => 'روایت تصویری',
            'code' => $code,
            'type' => 'video',
            'status' => 'producing',
            'owner_id' => $owner->id,
            'payload' => ['stages' => [[
                'id' => 'design', 'title' => 'طراحی', 'status' => 'in_progress',
                'outputs' => [['id' => 'poster', 'name' => 'پوستر', 'type' => 'design_file']],
            ]]],
        ]);
    }

    public function test_initial_file_is_a_real_asset_with_an_idempotent_content_relation(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.view', 'assets.upload', 'assets.preview', 'content.view']);
        $content = $this->content($owner);
        $folder = DamFolder::create(['name' => 'inputs', 'management_type' => DamFolder::USER, 'created_by' => $owner->id]);

        $assetId = $this->post('/api/v1/dam/library', [
            'title' => 'Initial brief',
            'content_id' => $content->id,
            'content_bucket' => 'inputs',
            'relation_role' => 'initial_input',
            'folder_id' => $folder->id,
            'duplicate_action' => 'reuse',
            'file' => UploadedFile::fake()->createWithContent('brief.txt', 'brief-body'),
        ])->assertCreated()->assertJsonPath('data.type', 'file')->json('data.id');

        $this->assertDatabaseHas('dam_assets', ['id' => $assetId, 'folder_id' => $folder->id]);
        $this->assertDatabaseHas('dam_relations', [
            'asset_id' => $assetId,
            'related_type' => 'content',
            'related_id' => $content->id,
            'relation_type' => 'initial_input',
        ]);
        $this->assertDatabaseCount('dam_files', 1);
    }

    public function test_failed_initial_upload_never_removes_the_already_created_content(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.upload', 'content.view']);
        $content = $this->content($owner, 'RV131');

        $this->post('/api/v1/dam/library', [
            'title' => 'Unsafe initial file',
            'content_id' => $content->id,
            'relation_role' => 'initial_input',
            'file' => UploadedFile::fake()->create('payload.php', 1),
        ], ['Accept' => 'application/json'])->assertUnprocessable();

        $this->assertDatabaseHas('contents', ['id' => $content->id, 'code' => 'RV131']);
        $this->assertDatabaseCount('dam_assets', 0);
    }

    public function test_stage_output_context_and_version_are_preserved_without_duplicate_relation(): void
    {
        $owner = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info', 'content.view']);
        $content = $this->content($owner);
        $folder = DamFolder::create(['name' => 'outputs', 'management_type' => DamFolder::USER, 'created_by' => $owner->id]);
        $assetId = $this->postJson('/api/v1/dam/library', [
            'title' => 'Poster source', 'body' => 'vector source', 'folder_id' => $folder->id,
            'content_id' => $content->id,
            'relation_role' => 'stage_output',
            'stage_id' => 'design',
            'output_id' => 'poster',
        ])->assertCreated()->json('data.id');
        $versionId = DamAsset::findOrFail($assetId)->versions()->value('id');

        $payload = [
            'related_type' => 'content', 'related_id' => $content->id,
            'relation_role' => 'stage_output', 'stage_id' => 'design',
            'output_id' => 'poster', 'asset_version_id' => $versionId,
        ];
        $this->postJson("/api/v1/dam/library/{$assetId}/relations", $payload)->assertOk();
        $this->postJson("/api/v1/dam/library/{$assetId}/relations", $payload)->assertOk();

        $this->assertDatabaseHas('dam_relations', [
            'asset_id' => $assetId, 'related_type' => 'content', 'related_id' => $content->id,
            'relation_type' => 'stage_output', 'stage_id' => 'design', 'output_id' => 'poster',
            'asset_version_id' => $versionId,
        ]);
        $this->assertSame(1, DamAsset::findOrFail($assetId)->relations()->count());
    }

    public function test_content_context_creates_the_managed_folder_tree(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.view', 'assets.upload', 'content.view']);
        $content = $this->content($owner, 'RV132');
        $this->postJson('/api/v1/dam/library', [
            'title' => 'Managed source', 'body' => 'source body',
            'content_id' => $content->id, 'content_bucket' => 'inputs',
            'relation_role' => 'initial_input',
        ])->assertCreated();
        $record = DamFolder::query()->where('system_key', 'content:'.$content->id)->firstOrFail();
        $this->assertSame('RV132 - روایت تصویری', $record->name);
        $this->assertSame(DamFolder::SYSTEM, $record->management_type);
        $this->assertDatabaseHas('dam_folders', [
            'parent_id' => $record->id,
            'name' => 'ورودی‌ها',
            'management_type' => DamFolder::SYSTEM,
            'system_key' => 'content:'.$content->id.':inputs',
        ]);
    }

    public function test_ordinary_user_cannot_delete_a_system_managed_folder(): void
    {
        $user = $this->actor(['assets.view', 'assets.delete']);
        $folder = DamFolder::create([
            'name' => 'managed', 'management_type' => DamFolder::SYSTEM,
            'system_key' => 'test-managed', 'created_by' => $user->id,
        ]);

        $this->deleteJson('/api/v1/dam/library/folders/'.$folder->id)->assertForbidden();
        $this->assertDatabaseHas('dam_folders', ['id' => $folder->id, 'management_type' => DamFolder::SYSTEM]);
    }

    public function test_checksum_duplicate_warning_is_visible_only_inside_the_access_scope(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['assets.view', 'assets.upload']);
        $folder = DamFolder::create(['name' => 'safe', 'management_type' => DamFolder::USER, 'created_by' => $owner->id]);
        $this->post('/api/v1/dam/library', [
            'title' => 'Secret original', 'confidentiality' => 'confidential', 'folder_id' => $folder->id,
            'file' => UploadedFile::fake()->createWithContent('same.txt', 'same-checksum'),
        ])->assertCreated();
        $this->post('/api/v1/dam/library', [
            'title' => 'Owner retry', 'folder_id' => $folder->id,
            'file' => UploadedFile::fake()->createWithContent('same-again.txt', 'same-checksum'),
        ], ['Accept' => 'application/json'])->assertConflict()
            ->assertJsonPath('code', 'dam_duplicate_detected');

        $outsider = $this->actor(['assets.view', 'assets.upload'], 'outsider');
        $otherFolder = DamFolder::create(['name' => 'other', 'management_type' => DamFolder::USER, 'created_by' => $outsider->id]);
        $this->post('/api/v1/dam/library', [
            'title' => 'Independent upload', 'folder_id' => $otherFolder->id,
            'file' => UploadedFile::fake()->createWithContent('same-third.txt', 'same-checksum'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertDatabaseCount('dam_assets', 2);
        $this->assertDatabaseCount('dam_files', 2);
    }

    public function test_dam_search_uses_related_content_code_and_keeps_confidential_scope(): void
    {
        $owner = $this->actor(['assets.view', 'assets.upload', 'content.view']);
        $content = $this->content($owner, 'KM141');
        $folder = DamFolder::create(['name' => 'search', 'management_type' => DamFolder::USER, 'created_by' => $owner->id]);
        $assetId = $this->postJson('/api/v1/dam/library', [
            'title' => 'Unrelated words', 'body' => 'plain', 'content_id' => $content->id, 'folder_id' => $folder->id,
            'confidentiality' => 'confidential',
        ])->assertCreated()->json('data.id');
        $this->getJson('/api/v1/dam/library?search=KM141')->assertOk()->assertJsonPath('data.0.id', $assetId);

        $this->actor(['assets.view'], 'search-outsider');
        $this->getJson('/api/v1/dam/library?search=KM141')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_asset_data_table_cell_accepts_only_an_accessible_central_asset(): void
    {
        $owner = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info']);
        $visible = DamAsset::create([
            'type' => 'content', 'title' => 'Visible', 'status' => 'draft',
            'confidentiality' => 'internal', 'owner_id' => $owner->id, 'created_by' => $owner->id,
        ]);
        $tableId = $this->postJson('/api/v1/dam/data-tables', [
            'name' => 'References',
            'columns' => [['id' => 'asset', 'name' => 'Asset', 'type' => 'asset', 'required' => true]],
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/dam/data-tables/{$tableId}/rows", [
            'cells' => ['asset' => $visible->id],
        ])->assertCreated();

        $other = $this->actor(['assets.view', 'assets.upload'], 'private-owner');
        $hidden = DamAsset::create([
            'type' => 'content', 'title' => 'Hidden', 'status' => 'draft',
            'confidentiality' => 'confidential', 'owner_id' => $other->id, 'created_by' => $other->id,
        ]);
        Sanctum::actingAs($owner->fresh());
        $this->postJson("/api/v1/dam/data-tables/{$tableId}/rows", [
            'cells' => ['asset' => $hidden->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['cells.asset']);
    }
}
