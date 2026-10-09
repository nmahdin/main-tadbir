<?php

namespace Tests\Feature;

use App\Models\DamAsset;
use App\Models\DamDataRow;
use App\Models\DamDataTable;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GoogleWorkspaceIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'google_workspace.access_token' => 'workspace-test-token',
            'google_workspace.drive_folder_id' => null,
        ]);
    }

    public function test_text_asset_pushes_and_pulls_google_docs_as_audited_dam_versions(): void
    {
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info']);
        $assetId = $this->postJson('/api/v1/dam/library', [
            'title' => 'سند راهبردی',
            'body' => '<h2>نسخه بومی</h2><p><strong>متن اولیه</strong></p>',
        ])->assertCreated()->json('data.id');

        $googleDocumentUpdated = false;
        Http::fake(function (Request $request) use (&$googleDocumentUpdated) {
            $url = $request->url();
            if ($request->method() === 'POST' && $url === 'https://docs.googleapis.com/v1/documents') {
                return Http::response(['documentId' => 'doc-safe-id']);
            }
            if ($request->method() === 'GET' && str_contains($url, 'docs.googleapis.com/v1/documents/doc-safe-id')) {
                if (! $googleDocumentUpdated) {
                    return Http::response(['body' => ['content' => [['endIndex' => 1]]]]);
                }

                return Http::response(['body' => ['content' => [[
                    'endIndex' => 16,
                    'paragraph' => [
                        'paragraphStyle' => ['namedStyleType' => 'HEADING_2'],
                        'elements' => [['textRun' => ['content' => "نسخه گوگل\n", 'textStyle' => ['bold' => true]]]],
                    ],
                ]]]]);
            }
            if ($request->method() === 'POST' && str_contains($url, 'documents/doc-safe-id:batchUpdate')) {
                return Http::response(['replies' => []]);
            }
            if ($request->method() === 'GET' && str_contains($url, 'drive/v3/files/doc-safe-id')) {
                return Http::response($this->driveFile(
                    'doc-safe-id',
                    'سند راهبردی',
                    'application/vnd.google-apps.document',
                    $googleDocumentUpdated ? '2' : '1',
                ));
            }

            return Http::response([], 404);
        });

        $push = $this->postJson("/api/v1/dam/library/{$assetId}/google-workspace/push")
            ->assertOk()
            ->assertJsonPath('data.link.resource_type', 'document')
            ->assertJsonMissingPath('data.link.google_file_id')
            ->assertJsonPath('data.link.web_url', 'https://docs.google.com/document/d/doc-safe-id/edit');
        $this->assertStringNotContainsString('workspace-test-token', $push->getContent());
        $this->assertDatabaseHas('google_workspace_links', [
            'dam_asset_id' => $assetId,
            'resource_type' => 'document',
            'google_file_id' => 'doc-safe-id',
        ]);
        $this->assertDatabaseHas('dam_activities', ['asset_id' => $assetId, 'action' => 'google_docs_pushed']);

        $googleDocumentUpdated = true;

        $this->postJson("/api/v1/dam/library/{$assetId}/google-workspace/pull")
            ->assertOk()
            ->assertJsonPath('data.link.resource_type', 'document');

        $asset = DamAsset::with(['contentItem', 'versions'])->findOrFail($assetId);
        $this->assertSame(2, $asset->versions->count());
        $this->assertStringContainsString('نسخه گوگل', $asset->contentItem->content_body);
        $this->assertDatabaseHas('dam_versions', [
            'asset_id' => $assetId,
            'version_number' => 2,
            'change_description' => 'دریافت تغییرات از Google Docs',
            'created_by' => $actor->id,
        ]);
        $this->assertDatabaseHas('dam_activities', ['asset_id' => $assetId, 'action' => 'google_docs_pulled']);
    }

    public function test_google_sheets_sync_preserves_stable_rows_detects_conflicts_and_versions_imports(): void
    {
        $actor = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info']);
        $tableId = $this->postJson('/api/v1/dam/data-tables', [
            'name' => 'جدول داده',
            'columns' => [['id' => 'name', 'name' => 'نام', 'type' => 'text']],
        ])->assertCreated()->json('data.id');
        $rowId = $this->postJson("/api/v1/dam/data-tables/{$tableId}/rows", [
            'cells' => ['name' => 'ردیف بومی'],
        ])->assertCreated()->json('data.id');

        $googleSheetUpdated = false;
        Http::fake(function (Request $request) use ($rowId, &$googleSheetUpdated) {
            $url = $request->url();
            if ($request->method() === 'POST' && $url === 'https://sheets.googleapis.com/v4/spreadsheets') {
                return Http::response([
                    'spreadsheetId' => 'sheet-safe-id',
                    'sheets' => [['properties' => ['sheetId' => 77, 'title' => 'داده‌ها']]],
                ]);
            }
            if ($request->method() === 'GET' && str_contains($url, 'drive/v3/files/sheet-safe-id')) {
                return Http::response($this->driveFile(
                    'sheet-safe-id',
                    'جدول داده',
                    'application/vnd.google-apps.spreadsheet',
                    $googleSheetUpdated ? '11' : '10',
                ));
            }
            if ($request->method() === 'GET'
                && str_contains($url, 'sheets.googleapis.com/v4/spreadsheets/sheet-safe-id')
                && ! str_contains($url, '/values/')) {
                return Http::response(['sheets' => [['properties' => ['sheetId' => 77, 'title' => 'داده‌ها']]]]);
            }
            if ($googleSheetUpdated && $request->method() === 'GET' && str_contains($url, 'spreadsheets/sheet-safe-id/values/')) {
                return Http::response(['values' => [
                    ['شناسه تدبیر', 'نام'],
                    ['tadbir:columns', 'tadbir-column:name'],
                    ['tadbir:'.$rowId, 'ویرایش گوگل'],
                    ['', 'ردیف تازه'],
                ]]);
            }
            if (str_contains($url, 'sheets.googleapis.com/v4/spreadsheets/sheet-safe-id')) {
                return Http::response(['updatedRows' => 3]);
            }

            return Http::response([], 404);
        });

        $this->postJson("/api/v1/dam/data-tables/{$tableId}/google-workspace/push")
            ->assertOk()->assertJsonPath('data.link.resource_type', 'spreadsheet');
        $this->assertDatabaseHas('dam_data_table_versions', [
            'table_id' => $tableId, 'version_number' => 1, 'source' => 'google_sheets_push',
        ]);
        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer workspace-test-token')
            && $request->method() === 'PUT'
            && str_contains($request->url(), 'valueInputOption=RAW')
            && ($request->data()['values'][1][1] ?? null) === 'tadbir-column:name');

        DamDataRow::findOrFail($rowId)->update(['cells' => ['name' => 'تغییر محلی']]);
        $this->postJson("/api/v1/dam/data-tables/{$tableId}/google-workspace/pull")
            ->assertStatus(409);

        $googleSheetUpdated = true;

        $this->postJson("/api/v1/dam/data-tables/{$tableId}/google-workspace/pull", ['force' => true])
            ->assertOk()
            ->assertJsonPath('data.summary.created', 1)
            ->assertJsonPath('data.summary.updated', 1)
            ->assertJsonPath('data.summary.deleted', 0);

        $table = DamDataTable::with(['rows', 'versions'])->findOrFail($tableId);
        $this->assertCount(2, $table->rows);
        $this->assertSame('ویرایش گوگل', DamDataRow::findOrFail($rowId)->cells['name']);
        $this->assertSame(2, $table->versions->count());
        $this->assertDatabaseHas('dam_data_table_versions', [
            'table_id' => $tableId, 'version_number' => 2, 'source' => 'google_sheets_pull',
        ]);
        $this->assertDatabaseHas('dam_data_row_activities', [
            'table_id' => $tableId, 'row_id' => null, 'action' => 'google_sheets_pulled', 'actor_id' => $actor->id,
        ]);
    }

    public function test_google_workspace_write_endpoints_enforce_native_edit_permissions(): void
    {
        $owner = $this->actor(['assets.view', 'assets.upload', 'assets.edit_info'], 'owner');
        $assetId = $this->postJson('/api/v1/dam/library', ['title' => 'Protected', 'body' => 'متن'])->assertCreated()->json('data.id');
        $reader = $this->actor(['assets.view'], 'reader');

        $this->getJson("/api/v1/dam/library/{$assetId}/google-workspace")->assertOk();
        $this->postJson("/api/v1/dam/library/{$assetId}/google-workspace/push")->assertForbidden();
        $this->assertNotSame($owner->id, $reader->id);
        $this->assertDatabaseCount('google_workspace_links', 0);
    }

    /** @return array<string, mixed> */
    private function driveFile(string $id, string $name, string $mime, string $version): array
    {
        $segment = $mime === 'application/vnd.google-apps.document' ? 'document' : 'spreadsheets';

        return [
            'id' => $id,
            'name' => $name,
            'mimeType' => $mime,
            'modifiedTime' => '2026-10-09T10:00:00Z',
            'version' => $version,
            'trashed' => false,
            'webViewLink' => "https://docs.google.com/{$segment}/d/{$id}/edit",
        ];
    }

    private function actor(array $permissions, string $suffix = 'member'): User
    {
        $role = Role::create([
            'key' => 'workspace-'.$suffix.'-'.uniqid(),
            'name' => 'Workspace '.$suffix,
            'is_system' => false,
            'is_active' => true,
        ]);
        foreach ($permissions as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'dam']);
            $role->permissions()->syncWithoutDetaching($permission);
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }
}
