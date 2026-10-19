<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UX-02-3 Stage A: multi-column sorting on the shared workspace
 * list contract. The spec is allowlist-validated (no arbitrary SQL
 * columns), each field appears once, precedence is explicit, and a
 * stable id tiebreaker always terminates the ordering. The legacy
 * sort+direction pair keeps working unchanged.
 */
class WorkspaceListMultiSortTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create(['username' => 'multisort.user']);
        $role = Role::create([
            'key' => 'multisort_test', 'name' => 'MultiSort Test', 'description' => 'test',
            'color' => '#000000', 'is_system' => false, 'is_active' => true,
        ]);
        $permissions = collect(['projects.view'])->map(fn (string $key) => Permission::create([
            'key' => $key, 'label' => $key, 'description' => $key, 'category' => 'projects',
        ]));
        $role->permissions()->sync($permissions->pluck('id'));
        $this->user->update(['role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($this->user);
    }

    private function project(string $name, string $priority, string $deadline, string $status = 'active'): Project
    {
        return Project::create([
            'name' => $name,
            'description' => $name,
            'project_manager_id' => $this->user->id,
            'status' => $status,
            'priority' => $priority,
            'deadline' => $deadline,
        ]);
    }

    public function test_multi_sort_applies_explicit_precedence_with_id_tiebreaker(): void
    {
        $low = $this->project('Low Early', 'low', '2026-10-01');
        $highLate = $this->project('High Late', 'high', '2026-12-01');
        $highEarly = $this->project('High Early', 'high', '2026-11-01');

        // priority is a string column: 'low' > 'high' alphabetically, so
        // priority:asc puts both high rows first (deadline:asc breaks
        // their tie), then the low row.
        $response = $this->getJson('/api/v1/projects?sort=priority:asc,deadline:asc')->assertOk();

        $this->assertSame(
            [$highEarly->id, $highLate->id, $low->id],
            collect($response->json('data'))->pluck('id')->all(),
        );
    }

    public function test_legacy_sort_and_direction_still_apply(): void
    {
        $this->project('Later', 'low', '2026-12-01');
        $this->project('Earlier', 'low', '2026-10-01');

        $response = $this->getJson('/api/v1/projects?sort=deadline&direction=asc')->assertOk();

        $this->assertSame(['Earlier', 'Later'], collect($response->json('data'))->pluck('name')->all());
    }

    public function test_invalid_multi_sort_specs_are_rejected(): void
    {
        // Unknown column must never reach SQL.
        $this->getJson('/api/v1/projects?sort=password:asc')->assertUnprocessable();
        // Duplicate field.
        $this->getJson('/api/v1/projects?sort=deadline:asc,deadline:desc')->assertUnprocessable();
        // Bad direction.
        $this->getJson('/api/v1/projects?sort=deadline:sideways')->assertUnprocessable();
        // More than three criteria.
        $this->getJson('/api/v1/projects?sort=deadline:asc,created_at:asc,updated_at:asc,priority:asc')->assertUnprocessable();
        // priority is not sortable on contents.
        $this->getJson('/api/v1/contents?sort=priority:asc')->assertUnprocessable();
    }
}
