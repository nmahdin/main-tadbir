<?php

namespace Tests\Feature\Bale;

use App\Bot\Bale\Support\PanelLinks;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BalePanelLinksTest extends TestCase
{
    use BaleTestSupport, RefreshDatabase;

    public function test_task_details_have_panel_and_direct_links_without_credentials(): void
    {
        $this->ready();
        config(['bale.panel_url' => 'https://tadbir.morvarid-daron.ir/']);
        $user = $this->user();
        $this->link($user);
        $task = $this->task($user);
        $this->tick([$this->buttonUpdate(1, 'task:'.$task->id)]);
        $buttons = collect($this->sent[0]['reply_markup']['inline_keyboard'])->flatten(1)->whereNotNull('url')->pluck('url')->all();
        $this->assertContains('https://tadbir.morvarid-daron.ir/', $buttons);
        $this->assertContains('https://tadbir.morvarid-daron.ir/?task='.$task->id, $buttons);
        $this->assertStringNotContainsString(self::TOKEN, json_encode($buttons));
    }

    public function test_edit_form_uses_the_same_link_builder(): void
    {
        $this->ready();
        config(['bale.panel_url' => 'https://tadbir.morvarid-daron.ir/']);
        $user = $this->user();
        $this->link($user);
        $task = $this->task($user);
        $permission = Permission::firstOrCreate(['key' => 'tasks.edit'], ['label' => 'edit', 'category' => 'tasks']);
        $user->role->permissions()->attach($permission);
        $this->tick([$this->buttonUpdate(1, 'editfield:'.$task->id.':title')]);
        $this->assertStringContainsString('?task='.$task->id, json_encode($this->sent));
    }

    public function test_only_task_subjects_have_direct_links_and_invalid_bases_are_rejected(): void
    {
        config(['bale.panel_url' => 'https://example.test/panel']);
        $this->assertSame('https://example.test/panel/?task=12', app(PanelLinks::class)->buttons('task', 12)[0][0]['url']);
        $this->assertCount(1, app(PanelLinks::class)->buttons('project', 12));
        foreach (['http://example.test', 'https://name:secret@example.test/', 'https://example.test/?secret=x', 'https://example.test/#x', 'javascript:alert(1)'] as $base) {
            config(['bale.panel_url' => $base]);
            $this->assertSame([], app(PanelLinks::class)->buttons('task', 12));
        }
    }

    public function test_task_get_requires_login_current_permission_and_active_user(): void
    {
        $user = $this->user();
        $task = $this->task($user);
        $this->getJson('/api/v1/tasks/'.$task->id)->assertUnauthorized();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/tasks/'.$task->id)->assertOk()->assertJsonPath('data.id', (string) $task->id);
        $user->update(['status' => 'blocked']);
        Sanctum::actingAs($user->fresh());
        $this->getJson('/api/v1/tasks/'.$task->id)->assertForbidden();
        $user->update(['status' => 'active', 'role_id' => Role::create(['key' => 'no_task_read', 'name' => 'No task read'])->id]);
        Sanctum::actingAs($user->fresh());
        $this->getJson('/api/v1/tasks/'.$task->id)->assertForbidden();
    }

    public function test_direct_task_get_is_not_limited_to_first_page_and_deleted_task_is_404(): void
    {
        $user = $this->user();
        $target = $this->task($user);
        for ($i = 0; $i < 101; $i++) {
            $this->task($user);
        }
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/tasks/'.$target->id)->assertOk()->assertJsonPath('data.id', (string) $target->id);
        $target->delete();
        $this->getJson('/api/v1/tasks/'.$target->id)->assertNotFound();
    }
}
