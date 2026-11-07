<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UX-02-3 projects CSV export: same authorization and scoping as
 * the list, allowlisted columns only, multi-sort preserved,
 * formula-injection neutralized, audited, bounded.
 */
class ProjectsCsvExportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create(['username' => 'export.user']);
        $role = Role::create([
            'key' => 'export_test', 'name' => 'Export Test', 'description' => 'test',
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
            'status' => $status, 'priority' => 'high', 'deadline' => '2026-11-01',
        ]);
    }

    public function test_export_streams_filtered_sorted_csv_with_safe_cells_and_audit(): void
    {
        $this->project('=SUM(A1:A9)'); // formula-injection attempt as a name
        $this->project('پروژه فارسی');
        $this->project('Hidden Done', 'completed');

        $response = $this->get('/api/v1/projects/export?status=active&columns=name,status&sort=priority:asc,deadline:asc');
        $response->assertOk();
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));

        $csv = $response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv); // BOM for Excel/Persian
        $this->assertStringContainsString('نام پروژه', $csv);
        $this->assertStringContainsString('پروژه فارسی', $csv);
        $this->assertStringContainsString("'=SUM(A1:A9)", $csv); // neutralized
        $this->assertStringNotContainsString('Hidden Done', $csv); // filter respected

        $audit = ActivityLog::query()->where('type', 'projects_exported')->latest('id')->first();
        $this->assertNotNull($audit);
        $this->assertSame($this->user->id, $audit->user_id);
        $this->assertSame(2, $audit->metadata['rows']);
        $this->assertSame(['name', 'status'], $audit->metadata['columns']);
    }

    public function test_export_rejects_unknown_columns_and_requires_permission(): void
    {
        $this->getJson('/api/v1/projects/export?columns=name,password')->assertUnprocessable();

        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);
        $this->get('/api/v1/projects/export')->assertForbidden();
    }
}
