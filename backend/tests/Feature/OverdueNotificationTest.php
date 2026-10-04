<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Services\OverdueNotifications;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OverdueNotificationTest extends TestCase
{
    use RefreshDatabase;

    public $mockConsoleOutput = false;

    private function actor(): User
    {
        $role = Role::create(['key' => 'overdue', 'name' => 'Overdue', 'is_active' => true]);
        foreach (['content.view', 'content.edit', 'tasks.view', 'projects.view'] as $key) {
            $role->permissions()->attach(Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'tests']));
        }
        $user = User::factory()->create(['status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_overdue_reminders_are_idempotent_and_never_change_the_deadline(): void
    {
        $manager = $this->actor();
        $assignee = User::factory()->create(['status' => 'active', 'role_id' => $manager->role_id, 'role_key' => $manager->role_key]);
        $project = Project::create(['name' => 'Late', 'status' => 'active', 'project_manager_id' => $manager->id]);
        $task = Task::create([
            'title' => 'Late task', 'status' => 'in_progress', 'assignee_id' => $assignee->id,
            'project_id' => $project->id, 'deadline' => Carbon::now()->subDays(3)->toDateString(),
        ]);
        $content = Content::create([
            'title' => 'Late content', 'type' => 'article', 'status' => 'producing',
            'owner_id' => $assignee->id, 'deadline' => Carbon::now()->subDays(1)->toDateString(), 'payload' => [],
        ]);
        $deadline = $task->fresh()->deadline->toDateString();
        $contentDeadline = $content->fresh()->deadline->toDateString();

        $service = app(OverdueNotifications::class);
        $first = $service->run();
        $second = $service->run();
        $third = $service->run(Carbon::now()->addDay());

        $this->assertSame(2, $first['scanned']);
        // One reminder for the task to its assignee, one to the project manager
        // and one for the content to its owner.
        $this->assertSame(3, $first['reminders']);
        $this->assertSame(0, $second['reminders']);
        $this->assertSame(0, $third['reminders']);
        // One reminder per subject, per recipient, forever.
        $this->assertSame(3, DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)->count());
        $this->assertSame(0, DomainRecord::where('domain', DomainRecord::DOMAIN_NOTIFICATION)
            ->where('payload->type', '!=', 'overdue')->count());
        // The original deadlines are untouched.
        $this->assertSame($deadline, $task->fresh()->deadline->toDateString());
        $this->assertSame($contentDeadline, $content->fresh()->deadline->toDateString());
    }

    public function test_completed_work_and_published_content_are_not_reminded(): void
    {
        $manager = $this->actor();
        Task::create(['title' => 'Done', 'status' => 'completed', 'assignee_id' => $manager->id,
            'deadline' => Carbon::now()->subDays(5)->toDateString()]);
        Content::create(['title' => 'Published', 'type' => 'article', 'status' => 'published',
            'owner_id' => $manager->id, 'deadline' => Carbon::now()->subDays(5)->toDateString(), 'payload' => []]);
        $this->assertSame(0, app(OverdueNotifications::class)->run()['reminders']);
    }

    public function test_the_console_command_exists_and_reports_its_result(): void
    {
        $this->assertSame(0, Artisan::call('content:overdue-notifications'));
        $this->assertStringContainsString('Overdue reminders: scanned=0 reminders=0.', Artisan::output());
        // The command is safe to repeat: no cron, no lock and no queue needed.
        $this->assertSame(0, Artisan::call('content:overdue-notifications'));
        $this->assertSame(0, DomainRecord::count());
    }
}
