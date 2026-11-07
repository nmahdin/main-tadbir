<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use App\Modules\Projects\Services\ProjectXlsxExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

/**
 * UX-02-3-FINAL XLSX export: dependency-free OOXML writer behind
 * the same scoping as the list/CSV export. All text cells are
 * inline strings, so formula-shaped values can never execute.
 */
class ProjectsXlsxExportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        if (! ProjectXlsxExporter::available()) {
            $this->markTestSkipped('ext-zip is required for XLSX generation.');
        }

        $this->user = User::factory()->create(['username' => 'xlsx.user']);
        $role = Role::create([
            'key' => 'xlsx_test', 'name' => 'XLSX Test', 'description' => 'test',
            'color' => '#000000', 'is_system' => false, 'is_active' => true,
        ]);
        $permissions = collect(['projects.view'])->map(fn (string $key) => Permission::create([
            'key' => $key, 'label' => $key, 'description' => $key, 'category' => 'projects',
        ]));
        $role->permissions()->sync($permissions->pluck('id'));
        $this->user->update(['role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($this->user);
    }

    private function project(string $name, string $status = 'active'): Project
    {
        return Project::create([
            'name' => $name, 'description' => $name, 'project_manager_id' => $this->user->id,
            'status' => $status, 'priority' => 'high', 'deadline' => '2026-11-01', 'progress' => 40,
        ]);
    }

    public function test_xlsx_export_is_a_valid_workbook_with_safe_cells_and_audit(): void
    {
        $this->project('=HYPERLINK("https://evil.example")');
        $this->project('پروژه نمونه');
        $this->project('پنهان', 'completed');

        $response = $this->get('/api/v1/projects/export.xlsx?status=active&columns=name,progress');
        $response->assertOk();
        $this->assertStringContainsString('spreadsheetml', $response->headers->get('Content-Type'));

        $bytes = $response->streamedContent();
        $this->assertStringStartsWith('PK', $bytes, 'xlsx is a zip package');

        $path = tempnam(sys_get_temp_dir(), 'xlsx-test-');
        file_put_contents($path, $bytes);
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path));
        $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        @unlink($path);

        $this->assertStringContainsString('نام پروژه', $sheet);
        $this->assertStringContainsString('پروژه نمونه', $sheet);
        $this->assertStringContainsString('=HYPERLINK', $sheet); // present as data…
        $this->assertStringNotContainsString('<f>', $sheet); // …never as a formula cell
        $this->assertStringNotContainsString('پنهان', $sheet); // filter respected
        $this->assertStringContainsString('rightToLeft="1"', $sheet);

        $audit = ActivityLog::query()->where('type', 'projects_exported')->latest('id')->first();
        $this->assertNotNull($audit);
        $this->assertSame('xlsx', $audit->metadata['format']);
        $this->assertSame(2, $audit->metadata['rows']);
    }

    public function test_xlsx_export_requires_permission(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->get('/api/v1/projects/export.xlsx')->assertForbidden();
    }
}
