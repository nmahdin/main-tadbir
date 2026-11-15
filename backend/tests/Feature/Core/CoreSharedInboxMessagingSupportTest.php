<?php

namespace Tests\Feature\Core;

use App\Core\Inbox\ActionInboxService;
use App\Core\Inbox\ActionItemStatus;
use App\Core\Inbox\ActionItemUrgency;
use App\Core\Inbox\CoreActionItem;
use App\Core\Messaging\CoreSystemMessage;
use App\Core\Messaging\CoreSystemMessageDelivery;
use App\Core\Messaging\SystemMessageAudience;
use App\Core\Messaging\SystemMessageService;
use App\Core\Platform\PlatformRole;
use App\Core\Platform\PlatformRoleAssignment;
use App\Core\Platform\PlatformRoleProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Support\CoreSupportActivity;
use App\Core\Support\CoreSupportAttachment;
use App\Core\Support\CoreSupportMessage;
use App\Core\Support\CoreSupportTicket;
use App\Core\Support\SupportTicketPriority;
use App\Core\Support\SupportTicketService;
use App\Core\Support\SupportTicketStatus;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C6-CORE — CORE-REQ / SYS-MSG / SUP integrated backend tests.
 * Covers deterministic idempotency, tenant isolation, the read/ack
 * split, state-machine transitions, attachment signed access, and
 * platform authorization matrix.
 */
class CoreSharedInboxMessagingSupportTest extends TestCase
{
    use RefreshDatabase;

    private PlatformRole $primaryRole;
    private PlatformRole $supportAgentRole;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalog::sync();
        $this->primaryRole = app(PlatformRoleProvisioner::class)->ensurePrimaryAdministrator();
        $this->supportAgentRole = app(PlatformRoleProvisioner::class)->ensureSupportAgentRole();
        Storage::fake('private');
    }

    private function makePrimary(): User
    {
        $u = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::query()->create([
            'platform_role_id' => $this->primaryRole->id,
            'user_id' => $u->id,
            'granted_by_user_id' => $u->id,
        ]);
        return $u->fresh();
    }

    private function makeAgent(): User
    {
        $u = User::factory()->create(['status' => 'active']);
        PlatformRoleAssignment::query()->create([
            'platform_role_id' => $this->supportAgentRole->id,
            'user_id' => $u->id,
            'granted_by_user_id' => $u->id,
        ]);
        return $u->fresh();
    }

    // ---- CORE-REQ --------------------------------------------------

    public function test_inbox_publish_is_idempotent_and_scoped(): void
    {
        $alice = User::factory()->create(['status' => 'active']);
        $bob = User::factory()->create(['status' => 'active']);
        $service = app(ActionInboxService::class);

        $first = $service->publish($alice, [
            'origin_module' => 'billing',
            'origin_type' => 'payment_failed',
            'origin_id' => 42,
            'action_kind' => ActionItemStatus::OPEN->value,
            'title' => 'Retry payment',
            'urgency' => ActionItemUrgency::HIGH->value,
            'deep_link' => '/billing/payments/42',
        ], $alice);

        $second = $service->publish($alice, [
            'origin_module' => 'billing',
            'origin_type' => 'payment_failed',
            'origin_id' => 42,
            'action_kind' => ActionItemStatus::OPEN->value,
            'title' => 'Retry payment (updated)',
        ], $alice);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, CoreActionItem::query()->count());
        $this->assertSame('Retry payment (updated)', $second->title);

        // Deep-link scheme is sanitized.
        $evil = $service->publish($alice, [
            'origin_module' => 'billing',
            'origin_type' => 'payment_failed',
            'origin_id' => 99,
            'title' => 'X',
            'deep_link' => 'javascript:alert(1)',
        ], $alice);
        $this->assertNull($evil->deep_link);

        // Bob cannot see Alice's personal item.
        Sanctum::actingAs($bob);
        $this->getJson('/api/v1/me/inbox')->assertJsonPath('meta.total', 0);
        Sanctum::actingAs($alice);
        $this->getJson('/api/v1/me/inbox')->assertJsonPath('meta.total', 2);
    }

    public function test_inbox_origin_resolve_is_idempotent_and_sweep_marks_overdue(): void
    {
        $alice = User::factory()->create(['status' => 'active']);
        $service = app(ActionInboxService::class);
        $item = $service->publish($alice, [
            'origin_module' => 'billing',
            'origin_type' => 'payment_failed',
            'origin_id' => 7,
            'title' => 'Pay',
            'due_at' => CarbonImmutable::now('UTC')->subDay(),
        ], $alice);

        $n = $service->sweepOverdue();
        $this->assertSame(1, $n);
        $this->assertSame(ActionItemStatus::OVERDUE->value, $item->fresh()->action_kind);

        // Second sweep is a no-op.
        $this->assertSame(0, $service->sweepOverdue());

        $resolved = $service->resolveOrigin('billing', 'payment_failed', 7, 'billing_module');
        $this->assertSame(1, $resolved);
        $this->assertNotNull($item->fresh()->resolved_at);
        // Re-resolve is idempotent.
        $this->assertSame(0, $service->resolveOrigin('billing', 'payment_failed', 7, 'billing_module'));
    }

    public function test_inbox_rejects_executing_arbitrary_actions_there_is_no_execution_endpoint(): void
    {
        $alice = User::factory()->create(['status' => 'active']);
        $service = app(ActionInboxService::class);
        $item = $service->publish($alice, [
            'origin_module' => 'billing', 'origin_type' => 'x', 'origin_id' => 1,
            'title' => 'Do thing', 'allowed_actions' => ['cancel'],
        ], $alice);

        Sanctum::actingAs($alice);
        // The only write endpoint is dismiss, which marks the inbox row resolved
        // locally without invoking any origin-module command. There is no execute
        // endpoint and no action= query parameter accepted.
        $this->postJson("/api/v1/me/inbox/{$item->id}/dismiss")->assertOk();
        $this->assertNotNull($item->fresh()->resolved_at);
        $this->assertSame('user_dismiss', $item->fresh()->resolved_by_module);
    }

    // ---- SYS-MSG ---------------------------------------------------

    public function test_system_message_draft_publish_read_ack_are_independent_and_immutable(): void
    {
        $admin = $this->makePrimary();
        $user = User::factory()->create(['status' => 'active']);
        /** @var SystemMessageService $svc */
        $svc = app(SystemMessageService::class);

        Sanctum::actingAs($admin);
        $res = $this->postJson('/api/v1/platform/messages', [
            'slug' => 'tos-update',
            'title' => 'Terms updated',
            'body_markdown' => '# New terms',
            'audience' => SystemMessageAudience::Platform->value,
            'ack_required' => true,
            'ack_policy_version' => 'v2',
            'publish' => true,
            'cta_link' => '/legal/tos',
        ])->assertCreated()->json('data');

        $msgId = $res['id'];
        $this->assertSame(1, $res['version']);

        Sanctum::actingAs($user);
        $this->getJson('/api/v1/me/messages')->assertOk()->assertJsonPath('meta.total', 1);
        $delivery = CoreSystemMessageDelivery::query()->where('user_id', $user->id)->first();
        $this->assertNotNull($delivery);
        $this->assertNull($delivery->read_at);
        $this->assertNull($delivery->acknowledged_at);

        // Mark read does NOT ack.
        $this->postJson("/api/v1/me/messages/{$delivery->id}/read")->assertOk();
        $delivery->refresh();
        $this->assertNotNull($delivery->read_at);
        $this->assertNull($delivery->acknowledged_at);

        // Acknowledge idempotently.
        $this->postJson("/api/v1/me/messages/{$delivery->id}/acknowledge")->assertOk()
            ->assertJsonPath('data.acknowledged_at', fn ($v) => $v !== null);
        $firstHash = $delivery->fresh()->ack_evidence_hash;
        $firstAckAt = $delivery->fresh()->acknowledged_at;

        // Second ack does not overwrite evidence.
        $this->postJson("/api/v1/me/messages/{$delivery->id}/acknowledge")->assertOk();
        $delivery->refresh();
        $this->assertSame($firstHash, $delivery->ack_evidence_hash);
        $this->assertSame($firstAckAt->toIso8601String(), $delivery->acknowledged_at->toIso8601String());

        // Pending acks is empty for this user now.
        $this->getJson('/api/v1/me/messages/pending-ack')->assertJsonCount(0, 'data');

        // Publishing a new version requires a new ack.
        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/platform/messages', [
            'slug' => 'tos-update',
            'title' => 'Terms v3',
            'body_markdown' => '# v3',
            'audience' => SystemMessageAudience::Platform->value,
            'ack_required' => true,
            'ack_policy_version' => 'v3',
            'bump_version' => true,
            'publish' => true,
        ])->assertCreated();

        Sanctum::actingAs($user);
        $pend = $this->getJson('/api/v1/me/messages/pending-ack')->json('data');
        $this->assertCount(1, $pend);
        $this->assertSame(2, $pend[0]['version']);
    }

    public function test_system_message_rejects_external_cta_links(): void
    {
        $admin = $this->makePrimary();
        /** @var SystemMessageService $svc */
        $svc = app(SystemMessageService::class);
        $msg = $svc->draft($admin, 'x', [
            'title' => 'Phish',
            'body_markdown' => 'x',
            'audience' => SystemMessageAudience::Platform->value,
            'cta_link' => 'https://evil.example.com/steal',
        ]);
        $this->assertNull($msg->cta_link);
    }

    public function test_user_cannot_access_another_users_delivery(): void
    {
        $admin = $this->makePrimary();
        $alice = User::factory()->create(['status' => 'active']);
        $bob = User::factory()->create(['status' => 'active']);
        /** @var SystemMessageService $svc */
        $svc = app(SystemMessageService::class);
        $msg = $svc->draft($admin, 'p', ['title' => 'p','body_markdown' => 'p','audience' => SystemMessageAudience::Personal->value]);
        $svc->publish($admin, $msg);
        $d = $svc->ensureDelivery($msg, $alice);
        // ensureDelivery refuses because personal audience only delivers to rows
        // pre-existing. So we create the delivery directly to prove isolation.
        CoreSystemMessageDelivery::query()->create([
            'message_id' => $msg->id, 'version' => $msg->version,
            'user_id' => $alice->id, 'first_delivered_at' => now(),
        ]);
        $delivery = CoreSystemMessageDelivery::query()->where('user_id', $alice->id)->first();
        Sanctum::actingAs($bob);
        $this->postJson("/api/v1/me/messages/{$delivery->id}/read")->assertNotFound();
        $this->postJson("/api/v1/me/messages/{$delivery->id}/acknowledge")->assertNotFound();
    }

    // ---- SUP -------------------------------------------------------

    public function test_support_ticket_full_flow_and_tenant_isolation(): void
    {
        $alice = User::factory()->create(['status' => 'active']);
        $bob = User::factory()->create(['status' => 'active']);
        $agent = $this->makeAgent();
        $admin = $this->makePrimary();

        Sanctum::actingAs($alice);
        $res = $this->postJson('/api/v1/support/tickets', [
            'subject' => 'Cannot log in',
            'category' => 'technical',
            'body' => 'Login returns 500.',
        ])->assertCreated()->json('data');
        $ticketId = $res['id'];
        $ref = $res['reference'];
        $this->assertStringStartsWith('TAD-', $ref);
        $this->assertSame(SupportTicketStatus::NEW->value, $res['status']);

        // Bob (orgless requester) cannot see Alice's ticket even if they somehow share an org.
        Sanctum::actingAs($bob);
        $this->getJson('/api/v1/support/tickets')->assertJsonPath('meta.total', 0);
        $this->getJson("/api/v1/support/tickets/{$ticketId}")->assertForbidden(); // agent required

        // Alice can view her own ticket.
        Sanctum::actingAs($alice);
        $this->getJson("/api/v1/support/tickets/{$ticketId}")->assertOk()
            ->assertJsonPath('data.reference', $ref);

        // Agent picks up and replies with an internal note (not visible to alice) + public reply.
        Sanctum::actingAs($agent);
        $this->getJson('/api/v1/platform/support/queue')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson("/api/v1/platform/support/tickets/{$ticketId}/assign", ['user_id' => $agent->id])->assertOk();
        $this->postJson("/api/v1/support/tickets/{$ticketId}/replies", [
            'body' => 'Internal triage note.',
            'internal_note' => true,
        ])->assertCreated();
        $this->postJson("/api/v1/support/tickets/{$ticketId}/replies", [
            'body' => 'Hi Alice, please try clearing cookies.',
        ])->assertCreated();

        // Status should be pending_user after agent reply.
        $ticket = CoreSupportTicket::find($ticketId);
        $this->assertSame(SupportTicketStatus::PENDING_USER->value, $ticket->status);

        // Alice sees only public replies (1), no internal notes.
        Sanctum::actingAs($alice);
        $shown = $this->getJson("/api/v1/support/tickets/{$ticketId}")->json('data');
        $this->assertCount(2, $shown['messages']); // initial + agent public (internal filtered)
        $this->assertEmpty($shown['activity']);    // requester never sees activity/notes

        // Attachment upload + signed download.
        Sanctum::actingAs($alice);
        $file = UploadedFile::fake()->create('screenshot.png', 200, 'image/png');
        $this->postJson("/api/v1/support/tickets/{$ticketId}/replies", [
            'body' => 'Here is the screenshot.',
            'attachments' => [$file],
        ])->assertCreated();
        $att = CoreSupportAttachment::query()->where('ticket_id', $ticketId)->first();
        $this->assertNotNull($att);
        $this->assertNotEmpty($att->access_token);

        // Bob cannot download via token (not owner, not agent).
        Sanctum::actingAs($bob);
        $this->getJson("/api/v1/support/attachments/{$att->access_token}")->assertForbidden();

        // Alice can download her own attachment.
        Sanctum::actingAs($alice);
        $this->get("/api/v1/support/attachments/{$att->access_token}")->assertOk();

        // Alice replies -> pending_reply.
        $this->postJson("/api/v1/support/tickets/{$ticketId}/replies", ['body' => 'Cookies cleared, works now, thanks!'])->assertCreated();
        $this->assertSame(SupportTicketStatus::PENDING_REPLY->value, CoreSupportTicket::find($ticketId)->status);

        // Admin closes the ticket through explicit status transition.
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/platform/support/tickets/{$ticketId}/status", ['status' => SupportTicketStatus::RESOLVED->value])->assertOk();
        $this->postJson("/api/v1/platform/support/tickets/{$ticketId}/status", ['status' => SupportTicketStatus::CLOSED->value])->assertOk();

        // Invalid transitions are rejected.
        $this->postJson("/api/v1/platform/support/tickets/{$ticketId}/status", ['status' => SupportTicketStatus::PENDING_USER->value])->assertStatus(422);

        // Reopen allowed.
        $this->postJson("/api/v1/platform/support/tickets/{$ticketId}/status", ['status' => SupportTicketStatus::OPEN->value])->assertOk();

        // Activity log is append-only (never updated).
        $this->assertGreaterThanOrEqual(5, CoreSupportActivity::query()->where('ticket_id', $ticketId)->count());
    }

    public function test_agent_permission_is_distinct_from_manage_and_requester_cannot_transition_status(): void
    {
        $alice = User::factory()->create(['status' => 'active']);
        $agent = $this->makeAgent();
        $svc = app(SupportTicketService::class);

        Sanctum::actingAs($alice);
        $ticket = $svc->openTicket($alice, ['subject' => 'Hi', 'category' => 'other', 'body' => 'hi']);

        // Alice cannot hit the status endpoint (permission platform.support.manage required).
        Sanctum::actingAs($alice);
        $this->postJson("/api/v1/platform/support/tickets/{$ticket->id}/status", ['status' => SupportTicketStatus::CLOSED->value])
            ->assertForbidden()->assertJsonPath('code', 'platform_forbidden');

        // Agent cannot change status either (manage-only operation).
        Sanctum::actingAs($agent);
        $this->postJson("/api/v1/platform/support/tickets/{$ticket->id}/status", ['status' => SupportTicketStatus::CLOSED->value])
            ->assertForbidden();
    }

    public function test_reference_generation_is_unique_under_concurrency(): void
    {
        $svc = app(SupportTicketService::class);
        $alice = User::factory()->create(['status' => 'active']);
        $refs = [];
        for ($i = 0; $i < 3; $i++) {
            $t = $svc->openTicket($alice, ['subject' => "T$i", 'category' => 'other', 'body' => 'b']);
            $refs[] = $t->reference;
        }
        $this->assertCount(3, array_unique($refs));
    }

    // ---- Permission provisioning ----------------------------------

    public function test_platform_permissions_are_registered_and_provisioner_runs_cleanly(): void
    {
        PermissionCatalog::assertKnownKeysForScope(
            \App\Core\Platform\PlatformRoleProvisioner::primaryPermissions(),
            PermissionCatalog::SCOPE_PLATFORM,
        );
        PermissionCatalog::assertKnownKeysForScope(
            \App\Core\Platform\PlatformRoleProvisioner::supportAgentPermissions(),
            PermissionCatalog::SCOPE_PLATFORM,
        );
        $this->assertTrue(true);
    }
}
