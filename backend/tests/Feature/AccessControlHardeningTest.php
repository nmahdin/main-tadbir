<?php

namespace Tests\Feature;

use App\Models\Content;
use App\Models\Department;
use App\Models\DomainRecord;
use App\Models\Permission;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Regression tests for the implemented first security tranche. */
class AccessControlHardeningTest extends TestCase
{
    use DatabaseMigrations;

    public $mockConsoleOutput = false;

    public function runDatabaseMigrations(): void
    {
        if (! app()->environment('testing') || config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Security tests require the isolated in-memory SQLite test database.');
        }
        $this->refreshTestDatabase();
        $this->beforeApplicationDestroyed(function () {
            RefreshDatabaseState::$migrated = false;
        });
    }

    private function actor(array $permissions = [], array $attributes = []): User
    {
        $role = Role::create(['key' => 'audit_'.Str::random(10), 'name' => 'Audit', 'is_active' => true]);
        foreach ($permissions as $key) {
            $permission = Permission::firstOrCreate(['key' => $key], ['label' => $key, 'category' => 'audit']);
            $role->permissions()->attach($permission);
        }

        return User::factory()->create([...['username' => 'audit_'.Str::random(10), 'status' => 'active', 'role_id' => $role->id, 'role_key' => $role->key], ...$attributes])->fresh();
    }

    private function task(User $owner): Task
    {
        return Task::create(['title' => 'Private task', 'assignee_id' => $owner->id, 'kind' => 'general', 'status' => 'backlog', 'priority' => 'medium']);
    }

    private function content(User $owner, array $payload = []): Content
    {
        return Content::create(['title' => 'Private content', 'type' => 'article', 'status' => 'idea', 'owner_id' => $owner->id,
            'payload' => ['title' => 'Private content', 'type' => 'article', 'status' => 'idea', ...$payload]]);
    }

    private function message(User $owner): DomainRecord
    {
        $conversation = DomainRecord::create(['domain' => DomainRecord::DOMAIN_CONVERSATION, 'user_id' => $owner->id,
            'payload' => ['memberIds' => [(string) $owner->id], 'type' => 'direct']]);

        return DomainRecord::create(['domain' => DomainRecord::DOMAIN_CHAT_MESSAGE, 'user_id' => $owner->id, 'parent_id' => $conversation->id,
            'payload' => ['senderId' => (string) $owner->id, 'conversationId' => (string) $conversation->id, 'text' => 'Private message']]);
    }

    private function assertDenied($response, string $reason): void
    {
        $this->assertContains($response->status(), [403, 404], $reason.'; HTTP '.$response->status());
    }

    public function test_a01_blocked_existing_session_cannot_read_tasks(): void
    {
        Sanctum::actingAs($this->actor(['tasks.view'], ['status' => 'blocked']));
        $this->assertDenied($this->getJson('/api/v1/tasks'), 'Blocked session must stop at server');
    }

    public function test_a02_disabled_role_does_not_grant_task_access(): void
    {
        $actor = $this->actor(['tasks.view']);
        $actor->role->update(['is_active' => false]);
        Sanctum::actingAs($actor->fresh());
        $this->assertDenied($this->getJson('/api/v1/tasks'), 'Disabled role still grants backend permissions');
    }

    public function test_a03_status_permission_cannot_change_task_title_via_full_update(): void
    {
        $task = $this->task($this->actor());
        Sanctum::actingAs($this->actor(['tasks.status']));
        $this->assertDenied($this->putJson('/api/v1/tasks/'.$task->id, ['title' => 'Unauthorized edit', 'status' => 'in_progress']), 'Mixed payload must check each operation');
        $this->assertSame('Private task', $task->fresh()->title);
    }

    public function test_a07_chat_nonmember_cannot_read_message(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->assertDenied($this->getJson('/api/v1/chat/messages/'.$message->id), 'Message read must require conversation membership');
    }

    public function test_a08_chat_nonmember_cannot_edit_message(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->assertDenied($this->putJson('/api/v1/chat/messages/'.$message->id, ['text' => 'Unauthorized edit']), 'Message edit must require authorship and membership');
    }

    public function test_a09_batch_delete_cannot_bypass_message_delete_policy(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->postJson('/api/v1/chat/messages/batch-delete', ['ids' => [$message->id]]);
        $this->assertDatabaseHas('domain_records', ['id' => $message->id]);
    }

    public function test_a10_users_edit_cannot_promote_another_account_to_admin(): void
    {
        $admin = Role::create(['key' => 'admin', 'name' => 'Admin', 'is_system' => true, 'is_active' => true]);
        $target = $this->actor();
        Sanctum::actingAs($this->actor(['users.edit']));
        $this->assertDenied($this->putJson('/api/v1/users/'.$target->id, ['roleId' => (string) $admin->id]), 'Profile editing must not grant admin assignment');
    }

    public function test_a11_status_only_operator_can_change_account_status(): void
    {
        $target = $this->actor();
        Sanctum::actingAs($this->actor(['users.status']));
        $this->putJson('/api/v1/users/'.$target->id, ['status' => 'blocked'])->assertOk();
    }

    public function test_a14_pending_user_cannot_login(): void
    {
        $user = $this->actor([], ['status' => 'pending', 'password' => 'Auditpass123']);
        $this->postJson('/api/v1/auth/login', ['login' => $user->username, 'password' => 'Auditpass123'])->assertForbidden();
    }

    public function test_a15_positive_control_single_message_delete_is_denied(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor());
        $this->assertDenied($this->deleteJson('/api/v1/chat/messages/'.$message->id), 'Single delete does have an ownership check');
    }

    public function test_a16_positive_control_profile_editor_cannot_change_own_role(): void
    {
        $actor = $this->actor(['users.edit']);
        $otherRole = Role::create(['key' => 'audit_other', 'name' => 'Other']);
        Sanctum::actingAs($actor);
        $this->assertDenied($this->putJson('/api/v1/users/'.$actor->id, ['roleId' => (string) $otherRole->id]), 'Self-role protection exists');
    }

    public function test_existing_bearer_token_stops_working_after_suspension_even_without_permission_middleware(): void
    {
        $actor = $this->actor(['tasks.view']);
        $token = $actor->createToken('security-test')->plainTextToken;
        $actor->update(['status' => 'blocked']);
        $this->withToken($token)->getJson('/api/v1/users/directory')->assertForbidden();
    }

    public function test_stale_admin_display_key_cannot_grant_admin_authority(): void
    {
        $actor = $this->actor([], ['role_key' => 'admin']);
        $this->assertFalse($actor->isAdmin());
        $actor->update(['role_id' => null]);
        $this->assertFalse($actor->fresh()->isAdmin());
    }

    public function test_disabling_admin_role_removes_admin_shortcuts(): void
    {
        $actor = $this->actor(['tasks.view']);
        $actor->role->update(['key' => 'admin', 'is_active' => false]);
        $this->assertFalse($actor->fresh()->isAdmin());
        $this->assertSame([], $actor->fresh()->permissionKeys());
    }

    public function test_status_only_update_works_but_mixed_update_is_atomic(): void
    {
        $task = $this->task($this->actor());
        Sanctum::actingAs($this->actor(['tasks.view', 'tasks.status']));
        $this->putJson('/api/v1/tasks/'.$task->id, ['title' => 'Forbidden', 'status' => 'in_progress'])->assertForbidden();
        $this->assertSame('backlog', $task->fresh()->status);
        $this->putJson('/api/v1/tasks/'.$task->id, ['status' => 'in_progress'])->assertOk();
        $this->assertSame('in_progress', $task->fresh()->status);
    }

    public function test_task_assignment_and_status_each_require_their_own_grant(): void
    {
        $owner = $this->actor();
        $task = $this->task($owner);
        $editor = $this->actor(['tasks.view', 'tasks.edit']);
        Sanctum::actingAs($editor);
        $this->putJson('/api/v1/tasks/'.$task->id, ['assigneeId' => $editor->id])->assertForbidden();
        $this->putJson('/api/v1/tasks/'.$task->id, ['status' => 'completed'])->assertForbidden();
        $this->putJson('/api/v1/tasks/'.$task->id, ['title' => 'Edited'])->assertOk();
        Sanctum::actingAs($this->actor(['tasks.view', 'tasks.assign']));
        $this->putJson('/api/v1/tasks/'.$task->id, ['assigneeId' => $editor->id])->assertOk();
        $this->assertSame($editor->id, $task->fresh()->assignee_id);
    }

    public function test_assignment_cannot_bootstrap_own_task_status_exception(): void
    {
        $task = $this->task($this->actor());
        $actor = $this->actor(['tasks.view', 'tasks.assign']);
        Sanctum::actingAs($actor);
        $this->putJson('/api/v1/tasks/'.$task->id, ['assigneeId' => $actor->id, 'status' => 'completed'])->assertForbidden();
        $this->assertNotSame($actor->id, $task->fresh()->assignee_id);
    }

    public function test_authorized_full_task_roundtrip_does_not_require_grants_for_unchanged_fields(): void
    {
        $task = $this->task($this->actor());
        Sanctum::actingAs($this->actor(['tasks.view', 'tasks.edit']));
        $this->putJson('/api/v1/tasks/'.$task->id, ['title' => 'Edited', 'status' => 'backlog', 'assigneeId' => (string) $task->assignee_id])->assertOk();
    }

    public function test_status_only_user_operator_cannot_change_other_fields(): void
    {
        $target = $this->actor();
        Sanctum::actingAs($this->actor(['users.status']));
        $this->putJson('/api/v1/users/'.$target->id, ['status' => 'blocked', 'name' => 'Injected'])->assertForbidden();
        $this->assertSame('active', $target->fresh()->status);
        $this->putJson('/api/v1/users/'.$target->id, ['status' => 'blocked', 'name' => $target->name])->assertOk();
    }

    public function test_user_creation_cannot_assign_a_role_without_delegation_authority(): void
    {
        $target = $this->actor(['tasks.view'])->role;
        Sanctum::actingAs($this->actor(['users.create']));
        $this->postJson('/api/v1/users', ['name' => 'New', 'username' => 'new_user',
            'password' => 'Strongpass123', 'password_confirmation' => 'Strongpass123', 'roleId' => (string) $target->id])->assertForbidden();
        $this->assertDatabaseMissing('users', ['username' => 'new_user']);
    }

    public function test_profile_editor_cannot_reset_an_administrators_password(): void
    {
        $admin = $this->actor();
        $admin->role->update(['key' => 'admin', 'is_system' => true]);
        Sanctum::actingAs($this->actor(['users.edit']));
        $this->putJson('/api/v1/users/'.$admin->id, ['password' => 'Stolenpass123', 'password_confirmation' => 'Stolenpass123'])->assertForbidden();
    }

    public function test_role_assignment_requires_consistent_identity_and_delegation_ceiling(): void
    {
        $target = $this->actor();
        $powerful = $this->actor(['settings.manage'])->role;
        $ordinary = $this->actor(['tasks.view'])->role;
        Sanctum::actingAs($this->actor(['users.edit', 'roles.manage_permissions', 'tasks.view']));
        $this->putJson('/api/v1/users/'.$target->id, ['roleId' => (string) $powerful->id])->assertForbidden();
        $this->putJson('/api/v1/users/'.$target->id, ['roleId' => (string) $ordinary->id, 'role' => $powerful->key])->assertUnprocessable();
        $this->putJson('/api/v1/users/'.$target->id, ['roleId' => (string) $ordinary->id, 'role' => $ordinary->key])->assertOk();
    }

    public function test_last_active_administrator_cannot_be_blocked_or_demoted(): void
    {
        $admin = $this->actor(['users.edit', 'users.status']);
        $admin->role->update(['key' => 'admin', 'is_system' => true]);
        $otherRole = $this->actor()->role;
        Sanctum::actingAs($admin->fresh());
        $this->putJson('/api/v1/users/'.$admin->id, ['status' => 'blocked'])->assertUnprocessable();
        $this->putJson('/api/v1/users/'.$admin->id, ['roleId' => (string) $otherRole->id])->assertUnprocessable();
        $this->assertSame('active', $admin->fresh()->status);
    }

    public function test_permission_manager_cannot_delegate_unknown_or_unheld_permissions(): void
    {
        $target = $this->actor()->role;
        Permission::create(['key' => 'settings.manage', 'label' => 'Settings', 'category' => 'settings']);
        Sanctum::actingAs($this->actor(['roles.manage_permissions', 'roles.edit', 'tasks.view']));
        $body = ['key' => $target->key, 'name' => $target->name];
        $this->putJson('/api/v1/roles/'.$target->id, [...$body, 'permissions' => ['unknown.permission']])->assertUnprocessable();
        $this->putJson('/api/v1/roles/'.$target->id, [...$body, 'permissions' => ['settings.manage']])->assertForbidden();
        $this->putJson('/api/v1/roles/'.$target->id, [...$body, 'permissions' => ['tasks.view']])->assertOk();
        $this->assertSame(['tasks.view'], $target->fresh()->permissions->pluck('key')->all());
    }

    public function test_role_editor_cannot_reactivate_a_role_or_rename_it_to_admin(): void
    {
        $target = $this->actor()->role;
        $target->update(['is_active' => false]);
        Sanctum::actingAs($this->actor(['roles.edit']));
        $this->putJson('/api/v1/roles/'.$target->id, ['key' => $target->key, 'name' => $target->name, 'isActive' => true])->assertForbidden();
        $this->putJson('/api/v1/roles/'.$target->id, ['key' => 'admin', 'name' => $target->name])->assertForbidden();
    }

    public function test_role_with_assigned_users_cannot_be_deleted(): void
    {
        $target = $this->actor()->role;
        Sanctum::actingAs($this->actor(['roles.delete']));
        $this->deleteJson('/api/v1/roles/'.$target->id)->assertUnprocessable();
    }

    public function test_chat_lists_and_filters_do_not_expose_nonmember_records(): void
    {
        $message = $this->message($this->actor());
        Sanctum::actingAs($this->actor(['messaging.view', 'messaging.manage_group', 'messaging.delete_message']));
        $this->getJson('/api/v1/chat/conversations')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/chat/messages')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/chat/messages?conversation_id='.$message->parent_id)->assertOk()->assertJsonCount(0, 'data');
        $this->deleteJson('/api/v1/chat/messages/'.$message->id)->assertNotFound();
    }

    public function test_chat_author_can_read_edit_and_delete_but_cannot_move_or_spoof_message(): void
    {
        $owner = $this->actor();
        $message = $this->message($owner);
        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/chat/messages/'.$message->id)->assertOk();
        $this->putJson('/api/v1/chat/messages/'.$message->id, ['senderId' => '999', 'text' => 'spoof'])->assertForbidden();
        $this->putJson('/api/v1/chat/messages/'.$message->id, ['conversationId' => '999'])->assertForbidden();
        $this->putJson('/api/v1/chat/messages/'.$message->id, ['text' => 'Updated'])->assertOk();
        $this->assertSame('Updated', $message->fresh()->payload['text']);
        $this->deleteJson('/api/v1/chat/messages/'.$message->id)->assertNoContent();
    }

    public function test_chat_members_can_read_but_not_edit_another_authors_message(): void
    {
        $owner = $this->actor();
        $member = $this->actor();
        $message = $this->message($owner);
        $conversation = DomainRecord::findOrFail($message->parent_id);
        $conversation->update(['payload' => [...$conversation->payload, 'memberIds' => [(string) $owner->id, $member->id]]]);
        Sanctum::actingAs($member);
        $this->getJson('/api/v1/chat/messages')->assertOk()->assertJsonCount(1, 'data');
        $this->putJson('/api/v1/chat/messages/'.$message->id, ['text' => 'Not mine'])->assertForbidden();
        $this->deleteJson('/api/v1/chat/messages/'.$message->id)->assertForbidden();
    }

    public function test_chat_batch_delete_is_all_or_nothing(): void
    {
        $owner = $this->actor();
        $own = $this->message($owner);
        $other = $this->message($this->actor());
        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/chat/messages/batch-delete', ['ids' => [$own->id, $other->id]])->assertNotFound();
        $this->assertDatabaseHas('domain_records', ['id' => $own->id]);
        $this->assertDatabaseHas('domain_records', ['id' => $other->id]);
        $this->postJson('/api/v1/chat/messages/batch-delete', ['ids' => [$own->id]])->assertNoContent();
    }

    public function test_chat_creation_uses_authenticated_author_and_checks_membership(): void
    {
        $other = $this->message($this->actor());
        $actor = $this->actor(['messaging.send_message', 'messaging.create_chat']);
        Sanctum::actingAs($actor);
        $this->postJson('/api/v1/chat/messages', ['conversationId' => (string) $other->parent_id, 'text' => 'Intruder'])->assertNotFound();
        $conversation = $this->postJson('/api/v1/chat/conversations', ['name' => 'Group', 'type' => 'group',
            'memberIds' => [(string) $actor->id], 'userId' => (string) $other->user_id])->assertCreated()->json('data.id');
        $message = $this->postJson('/api/v1/chat/messages', ['conversationId' => $conversation, 'text' => 'Hello', 'senderId' => (string) $other->user_id])
            ->assertCreated()->assertJsonPath('data.senderId', (string) $actor->id)->json('data.id');
        $this->assertDatabaseHas('domain_records', ['id' => $message, 'user_id' => $actor->id]);
    }

    public function test_blocked_account_can_still_revoke_its_token_by_logging_out(): void
    {
        $actor = $this->actor();
        $token = $actor->createToken('logout-test')->plainTextToken;
        $actor->update(['status' => 'blocked']);
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();
        $this->assertSame(0, $actor->tokens()->count());
    }

    public function test_missing_role_has_no_display_admin_or_permissions_in_profile(): void
    {
        $actor = $this->actor([], ['role_key' => 'admin', 'role_id' => null]);
        Sanctum::actingAs($actor);
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.role', '')
            ->assertJsonPath('data.roleIsActive', false)->assertJsonPath('data.permissions', []);
    }

    public function test_a_member_cannot_promote_themselves_or_add_an_outsider_to_chat(): void
    {
        $owner = $this->actor(['messaging.create_chat']);
        $member = $this->actor();
        $outsider = $this->actor();
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/chat/conversations', ['name' => 'Group', 'type' => 'group',
            'memberIds' => [(string) $owner->id, (string) $member->id]])->assertCreated()->json('data.id');
        Sanctum::actingAs($member);
        $this->putJson('/api/v1/chat/conversations/'.$id, ['memberIds' => [(string) $owner->id, (string) $member->id, (string) $outsider->id]])->assertForbidden();
        $this->putJson('/api/v1/chat/conversations/'.$id, ['members' => [['userId' => (string) $member->id, 'role' => 'admin']]])->assertForbidden();
        Sanctum::actingAs($outsider);
        $this->putJson('/api/v1/chat/conversations/'.$id, ['memberIds' => [(string) $outsider->id]])->assertNotFound();
    }

    public function test_owner_can_remove_member_and_membership_is_checked_again_on_next_read(): void
    {
        $owner = $this->actor(['messaging.create_chat', 'messaging.send_message']);
        $member = $this->actor();
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/chat/conversations', ['name' => 'Group', 'type' => 'group',
            'memberIds' => [(string) $owner->id, (string) $member->id]])->assertCreated()->json('data.id');
        $message = $this->postJson('/api/v1/chat/messages', ['conversationId' => $id, 'text' => 'Private'])->assertCreated()->json('data.id');
        Sanctum::actingAs($member);
        $this->getJson('/api/v1/chat/messages/'.$message)->assertOk();
        Sanctum::actingAs($owner);
        $this->putJson('/api/v1/chat/conversations/'.$id, ['memberIds' => [(string) $owner->id]])->assertOk();
        Sanctum::actingAs($member);
        $this->getJson('/api/v1/chat/messages/'.$message)->assertNotFound();
    }

    public function test_channel_write_rule_and_reply_parent_are_checked_on_server(): void
    {
        $owner = $this->actor(['messaging.create_chat', 'messaging.send_message']);
        $member = $this->actor(['messaging.send_message']);
        $otherMessage = $this->message($this->actor());
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/chat/conversations', ['name' => 'Channel', 'type' => 'channel', 'writePermission' => 'admins_only',
            'memberIds' => [(string) $owner->id, (string) $member->id]])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/chat/messages', ['conversationId' => $id, 'text' => 'Post'])->assertCreated();
        $this->postJson('/api/v1/chat/messages', ['conversationId' => $id, 'text' => 'Reply', 'replyToMessageId' => (string) $otherMessage->id])->assertUnprocessable();
        Sanctum::actingAs($member);
        $this->postJson('/api/v1/chat/messages', ['conversationId' => $id, 'text' => 'Not allowed'])->assertForbidden();
    }

    public function test_direct_conversation_cannot_be_reparented_to_new_members(): void
    {
        $owner = $this->actor(['messaging.create_chat']);
        $member = $this->actor();
        $outsider = $this->actor();
        Sanctum::actingAs($owner);
        $id = $this->postJson('/api/v1/chat/conversations', ['name' => 'Private', 'type' => 'direct',
            'memberIds' => [(string) $member->id]])->assertCreated()->json('data.id');
        $this->putJson('/api/v1/chat/conversations/'.$id, ['memberIds' => [(string) $owner->id, (string) $outsider->id]])->assertForbidden();
    }

    public function test_chat_commands_receipts_metadata_and_private_attachments_persist(): void
    {
        Storage::fake('local');
        $owner = $this->actor(['messaging.create_chat', 'messaging.send_message']);
        $member = $this->actor(['messaging.send_message']);
        $outsider = $this->actor();
        Sanctum::actingAs($owner);
        $conversation = $this->postJson('/api/v1/chat/conversations', [
            'name' => 'Persistent chat', 'type' => 'group',
            'memberIds' => [(string) $owner->id, (string) $member->id],
        ])->assertCreated()->json('data.id');
        $message = $this->postJson('/api/v1/chat/messages', [
            'conversationId' => $conversation, 'text' => 'Server message',
        ])->assertCreated()->assertJsonPath('data.reactions', [])->json('data.id');
        $this->getJson('/api/v1/chat/conversations/'.$conversation)
            ->assertOk()->assertJsonPath('data.lastMessage.text', 'Server message');
        $this->putJson('/api/v1/chat/messages/'.$message, ['command' => 'toggle_pin'])
            ->assertOk()->assertJsonPath('data.isPinned', true);

        Sanctum::actingAs($member);
        $this->getJson('/api/v1/chat/conversations/'.$conversation)->assertOk()->assertJsonPath('data.unreadCount', 1);
        $this->putJson('/api/v1/chat/messages/'.$message, ['command' => 'toggle_reaction', 'emoji' => '👍'])
            ->assertOk()->assertJsonPath('data.reactions.0.count', 1);
        $this->putJson('/api/v1/chat/messages/'.$message, ['command' => 'toggle_star'])
            ->assertOk()->assertJsonPath('data.isStarred', true);
        $this->putJson('/api/v1/chat/conversations/'.$conversation, ['command' => 'toggle_mute'])
            ->assertOk()->assertJsonPath('data.isMuted', true);
        $this->putJson('/api/v1/chat/conversations/'.$conversation, ['command' => 'mark_read'])
            ->assertOk()->assertJsonPath('data.unreadCount', 0);

        $attachment = $this->post('/api/v1/chat/conversations/'.$conversation.'/attachments', [
            'file' => UploadedFile::fake()->create('note.txt', 2, 'text/plain'),
        ], ['Accept' => 'application/json'])->assertCreated();
        $token = $attachment->json('data.id');
        $attachment->assertJsonPath('data.name', 'note.txt');
        Storage::disk('local')->assertExists('chat/'.$conversation.'/'.$token.'.txt');
        $this->postJson('/api/v1/chat/messages', [
            'conversationId' => $conversation,
            'text' => '',
            'attachments' => [$attachment->json('data')],
        ])->assertCreated()->assertJsonPath('data.attachments.0.id', $token);
        $this->get('/api/v1/chat/conversations/'.$conversation.'/attachments/'.$token)->assertOk();

        Sanctum::actingAs($outsider);
        $this->get('/api/v1/chat/conversations/'.$conversation.'/attachments/'.$token)->assertNotFound();
    }

    public function test_task_status_is_executable_by_assignee_global_project_and_content_managers(): void
    {
        $assignee = $this->actor(['tasks.view']);
        $task = $this->task($assignee);
        Sanctum::actingAs($assignee);
        $this->patchJson('/api/v1/tasks/'.$task->id.'/status', ['status' => 'in_progress'])->assertOk();

        $global = $this->actor(['tasks.view', 'tasks.status']);
        Sanctum::actingAs($global);
        $this->patchJson('/api/v1/tasks/'.$task->id.'/status', ['status' => 'review'])->assertOk();

        $projectManager = $this->actor(['tasks.view']);
        $project = Project::create(['name' => 'Managed', 'project_manager_id' => $projectManager->id]);
        $task->update(['project_id' => $project->id]);
        Sanctum::actingAs($projectManager);
        $this->patchJson('/api/v1/tasks/'.$task->id.'/status', ['status' => 'backlog'])->assertOk();

        $contentOwner = $this->actor(['tasks.view']);
        $content = $this->content($contentOwner);
        $task->update(['project_id' => null, 'content_id' => $content->id]);
        Sanctum::actingAs($contentOwner);
        $this->patchJson('/api/v1/tasks/'.$task->id.'/status', ['status' => 'in_progress'])->assertOk();

        $departmentManager = $this->actor(['tasks.view']);
        $department = Department::create(['name' => 'Managed department', 'manager_id' => $departmentManager->id]);
        $content->update(['owner_id' => null, 'payload' => [...$content->payload, 'departmentId' => (string) $department->id]]);
        Sanctum::actingAs($departmentManager);
        $this->patchJson('/api/v1/tasks/'.$task->id.'/status', ['status' => 'completed'])->assertOk();
    }

    public function test_authorized_task_updates_preserve_json_casts(): void
    {
        $owner = $this->actor();
        $task = $this->task($owner);
        $dependency = $this->task($owner);
        Sanctum::actingAs($this->actor(['tasks.view', 'tasks.edit']));
        $this->putJson('/api/v1/tasks/'.$task->id, ['tags' => ['security'], 'dependencies' => [$dependency->id]])->assertOk();
        $this->assertSame(['security'], $task->fresh()->tags);
        $this->assertSame([$dependency->id], $task->fresh()->dependencies);
    }
}
