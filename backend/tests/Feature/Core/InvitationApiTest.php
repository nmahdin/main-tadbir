<?php

namespace Tests\Feature\Core;

use App\Core\Identity\EmailVerificationDelivery;
use App\Core\Invitations\CoreInvitation;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Core\Invitations\Mail\InvitationMail;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage C6-3 — invitation administration, public preview, and
 * acceptance HTTP endpoints over the C6-1/C6-2 services.
 */
class InvitationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $ws;

    private ScopedRole $orgManagerRole;

    private ScopedRole $orgMemberRole;

    private ScopedRole $wsManagerRole;

    private ScopedRole $wsMemberRole;

    private CapturingEmailDelivery $delivery;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();
        $this->delivery = new CapturingEmailDelivery;
        $this->app->instance(EmailVerificationDelivery::class, $this->delivery);
        Mail::fake();

        $this->manager = User::factory()->create(['username' => 'api_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Api Org');
        $this->ws = $this->org->workspaces()->where('is_default', true)->firstOrFail();

        $roles = app(RoleProvisioner::class);
        $this->orgManagerRole = $roles->organizationManager($this->org);
        $this->orgMemberRole = $roles->organizationMember($this->org);
        $this->wsManagerRole = $roles->workspaceManager($this->ws);
        $this->wsMemberRole = $roles->workspaceMember($this->ws);
    }

    public function test_unauthenticated_admin_and_acceptance_requests_are_rejected_but_preview_is_public(): void
    {
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/invitations")->assertUnauthorized();
        $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [])->assertUnauthorized();
        $this->postJson('/api/v1/invitations/accept', ['token' => 'x'])->assertUnauthorized();
        $this->postJson('/api/v1/invitations/preview', ['token' => 'unknown-token'])
            ->assertNotFound()->assertJsonPath('code', 'invitation_not_found');
    }

    public function test_organization_invitation_issuance_list_and_email_delivery(): void
    {
        Sanctum::actingAs($this->manager);

        $response = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'Joiner@Example.com',
            'organization_role_id' => $this->orgMemberRole->id,
            'message' => 'Welcome aboard',
        ])->assertCreated();

        $response->assertJsonPath('data.invitation.email', 'joiner@example.com')
            ->assertJsonPath('data.invitation.status', 'pending')
            ->assertJsonPath('data.email_delivery_status', 'sent');
        $token = $response->json('data.invitation_token');
        $this->assertIsString($token);
        $this->assertStringContainsString($token, $response->json('data.accept_url'));
        Mail::assertSent(InvitationMail::class, fn (InvitationMail $mail) => $mail->hasTo('joiner@example.com'));

        $invitation = CoreInvitation::query()->sole();
        $this->assertSame(hash('sha256', $token), $invitation->token_hash);

        // Listing: allowlisted fields only — no token material.
        $list = $this->getJson("/api/v1/core/organizations/{$this->org->id}/invitations")->assertOk();
        $list->assertJsonCount(1, 'data')->assertJsonPath('data.0.email', 'joiner@example.com');
        $raw = $list->getContent();
        $this->assertStringNotContainsString($token, $raw);
        $this->assertStringNotContainsString('token_hash', $raw);
        $this->assertStringNotContainsString($invitation->token_hash, $raw);

        // Duplicate pending issuance: deterministic conflict, no second email.
        $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'joiner@example.com',
            'organization_role_id' => $this->orgMemberRole->id,
        ])->assertStatus(409)->assertJsonPath('code', 'invitation_duplicate_pending');
        Mail::assertSentCount(1);
    }

    public function test_unauthorized_issuance_and_grant_ceiling_are_denied_over_http(): void
    {
        $plainMember = User::factory()->create(['username' => 'api_plain', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $plainMember->id, 'role_id' => $this->orgMemberRole->id, 'status' => MembershipStatus::Active]);
        Sanctum::actingAs($plainMember);
        $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'nope@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->assertForbidden()->assertJsonPath('code', 'invitation_forbidden');
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/invitations")
            ->assertForbidden()->assertJsonPath('code', 'invitation_forbidden');

        // Clerk may invite as member (within ceiling) but never as manager.
        $clerkRole = ScopedRole::create(['scope' => 'organization', 'organization_id' => $this->org->id, 'key' => 'api_clerk', 'name' => 'Clerk', 'is_protected' => false]);
        $clerkRole->permissions()->attach(ScopedPermission::whereIn('key', ['organization.view', 'organization.members.manage'])->pluck('id'));
        $clerk = User::factory()->create(['username' => 'api_clerk', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $clerk->id, 'role_id' => $clerkRole->id, 'status' => MembershipStatus::Active]);
        Sanctum::actingAs($clerk);
        $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'escalate@example.com', 'organization_role_id' => $this->orgManagerRole->id,
        ])->assertForbidden()->assertJsonPath('code', 'invitation_grant_ceiling');
        $this->assertSame(0, CoreInvitation::count());
    }

    public function test_workspace_and_combined_issuance_require_their_own_authorities(): void
    {
        Sanctum::actingAs($this->manager);

        $this->postJson("/api/v1/core/workspaces/{$this->ws->id}/invitations", [
            'email' => 'ws@example.com', 'workspace_role_id' => $this->wsMemberRole->id,
        ])->assertCreated()->assertJsonPath('data.invitation.type', 'workspace');

        $this->postJson("/api/v1/core/workspaces/{$this->ws->id}/combined-invitations", [
            'email' => 'both@example.com',
            'organization_role_id' => $this->orgMemberRole->id,
            'workspace_role_id' => $this->wsMemberRole->id,
        ])->assertCreated()->assertJsonPath('data.invitation.type', 'combined');

        $this->getJson("/api/v1/core/workspaces/{$this->ws->id}/invitations")
            ->assertOk()->assertJsonCount(2, 'data');
        $this->getJson("/api/v1/core/organizations/{$this->org->id}/invitations")
            ->assertOk()->assertJsonCount(1, 'data'); // combined only; workspace-only is not an org invitation
    }

    public function test_public_preview_is_read_only_private_and_status_aware(): void
    {
        Sanctum::actingAs($this->manager);
        $token = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'preview@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->json('data.invitation_token');
        $this->app->get('auth')->forgetGuards();

        $preview = $this->postJson('/api/v1/invitations/preview', ['token' => $token])->assertOk();
        $preview->assertJsonPath('data.organization.name', 'Api Org')
            ->assertJsonPath('data.invitation.status', 'pending')
            ->assertJsonPath('data.invitation.will_create_organization_membership', true)
            ->assertJsonPath('data.intended_organization_role.scope', 'organization')
            ->assertJsonPath('data.inviter.name', $this->manager->name);
        $preview->assertHeader('Cache-Control', 'no-store, private');
        $preview->assertHeader('Referrer-Policy', 'no-referrer');
        $raw = $preview->getContent();
        $this->assertStringNotContainsString('preview@example.com', $raw);
        $this->assertStringNotContainsString($token, $raw);
        $this->assertStringNotContainsString('token_hash', $raw);
        $this->assertSame(CoreInvitation::STATUS_PENDING, CoreInvitation::query()->sole()->status, 'preview never consumes');

        // Revoked: minimal safe status only.
        app(\App\Core\Invitations\InvitationService::class)->revoke($this->manager, CoreInvitation::query()->sole());
        $revoked = $this->postJson('/api/v1/invitations/preview', ['token' => $token])->assertOk();
        $revoked->assertJsonPath('data.invitation.status', 'revoked');
        $this->assertArrayNotHasKey('organization', $revoked->json('data'));
        $this->assertArrayNotHasKey('inviter', $revoked->json('data'));
    }

    public function test_preview_is_rate_limited(): void
    {
        for ($i = 1; $i <= 20; $i++) {
            $this->postJson('/api/v1/invitations/preview', ['token' => 'nope'])->assertNotFound();
        }
        $this->postJson('/api/v1/invitations/preview', ['token' => 'nope'])->assertStatus(429);
    }

    public function test_acceptance_endpoint_combined_flow_role_preservation_and_repeat_rejection(): void
    {
        Sanctum::actingAs($this->manager);
        $combinedToken = $this->postJson("/api/v1/core/workspaces/{$this->ws->id}/combined-invitations", [
            'email' => 'newbie@example.com',
            'organization_role_id' => $this->orgMemberRole->id,
            'workspace_role_id' => $this->wsMemberRole->id,
        ])->json('data.invitation_token');

        $newbie = $this->verifiedUser('newbie@example.com', 'api_newbie');

        // Unverified accounts and mismatched users fail closed.
        $stranger = User::factory()->create(['username' => 'api_stranger', 'status' => 'active']);
        Sanctum::actingAs($stranger);
        $this->postJson('/api/v1/invitations/accept', ['token' => $combinedToken])
            ->assertForbidden()->assertJsonPath('code', 'invitation_email_mismatch');

        Sanctum::actingAs($newbie);
        $accepted = $this->postJson('/api/v1/invitations/accept', [
            'token' => $combinedToken,
            // Client-supplied overrides are never read:
            'organization_id' => 999999,
            'workspace_id' => 999999,
            'role_id' => $this->orgManagerRole->id,
            'actor_id' => $this->manager->id,
        ])->assertOk();
        $accepted->assertJsonPath('data.navigation_target.type', 'workspace')
            ->assertJsonPath('data.navigation_target.id', $this->ws->id)
            ->assertJsonPath('data.created_organization_membership', true)
            ->assertJsonPath('data.created_workspace_membership', true);
        $this->assertSame($this->orgMemberRole->id, (int) OrganizationMembership::query()->where('user_id', $newbie->id)->sole()->role_id);
        $this->assertSame($this->wsMemberRole->id, (int) WorkspaceMembership::query()->where('user_id', $newbie->id)->sole()->role_id);

        // Repeat acceptance: rejected, never duplicated.
        $this->postJson('/api/v1/invitations/accept', ['token' => $combinedToken])
            ->assertStatus(409)->assertJsonPath('code', 'invitation_already_accepted');
        $this->assertSame(1, OrganizationMembership::query()->where('user_id', $newbie->id)->count());

        // Existing org member (manager role) accepts a workspace invitation: org role preserved.
        Sanctum::actingAs($this->manager);
        $wsToken = $this->postJson("/api/v1/core/workspaces/{$this->ws->id}/invitations", [
            'email' => 'preserved@example.com', 'workspace_role_id' => $this->wsMemberRole->id,
        ])->json('data.invitation_token');
        $veteran = $this->verifiedUser('preserved@example.com', 'api_veteran');
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $veteran->id, 'role_id' => $this->orgManagerRole->id, 'status' => MembershipStatus::Active]);

        Sanctum::actingAs($veteran);
        $this->postJson('/api/v1/invitations/accept', ['token' => $wsToken])
            ->assertOk()->assertJsonPath('data.created_organization_membership', false);
        $this->assertSame($this->orgManagerRole->id, (int) OrganizationMembership::query()->where('user_id', $veteran->id)->sole()->role_id, 'existing org role is never replaced or elevated by acceptance');
    }

    public function test_revocation_endpoint_and_suspended_organization_restrictions(): void
    {
        Sanctum::actingAs($this->manager);
        $id = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'revokee@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->json('data.invitation.id');

        $this->postJson("/api/v1/core/invitations/{$id}/revoke")->assertOk()
            ->assertJsonPath('data.status', 'revoked');
        $this->postJson("/api/v1/core/invitations/{$id}/revoke")
            ->assertStatus(409)->assertJsonPath('code', 'invitation_already_revoked');

        // Suspension denies new issuance and acceptance of pending invitations.
        $pendingToken = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'pending@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->json('data.invitation_token');
        $this->org->forceFill(['status' => 'suspended'])->save();

        $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'blocked@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->assertStatus(409)->assertJsonPath('code', 'invitation_organization_unavailable');

        $invitee = $this->verifiedUser('pending@example.com', 'api_pending');
        Sanctum::actingAs($invitee);
        $this->postJson('/api/v1/invitations/accept', ['token' => $pendingToken])
            ->assertStatus(409)->assertJsonPath('code', 'invitation_organization_unavailable');
        $this->assertSame(
            CoreInvitation::STATUS_PENDING,
            CoreInvitation::query()->where('email_normalized', 'pending@example.com')->sole()->status,
            'denied acceptance never consumes'
        );
    }

    public function test_mail_delivery_failure_is_reported_and_recoverable_via_reissue(): void
    {
        // Real (non-faked) broken transport: connection refused instantly.
        Mail::clearResolvedInstances();
        $this->app->forgetInstance('mail.manager');
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => '127.0.0.1', 'mail.mailers.smtp.port' => 1]);

        Sanctum::actingAs($this->manager);
        $response = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'unreachable@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->assertCreated();
        $response->assertJsonPath('data.email_delivery_status', 'failed');
        $this->assertSame(1, CoreInvitation::count(), 'invitation persists; status is honestly reported');

        // Recovery: revoke + reissue mints a fresh token once transport is back.
        Mail::fake();
        $id = $response->json('data.invitation.id');
        $this->postJson("/api/v1/core/invitations/{$id}/revoke")->assertOk();
        $reissued = $this->postJson("/api/v1/core/organizations/{$this->org->id}/invitations", [
            'email' => 'unreachable@example.com', 'organization_role_id' => $this->orgMemberRole->id,
        ])->assertCreated();
        $reissued->assertJsonPath('data.email_delivery_status', 'sent');
        $this->assertNotSame($response->json('data.invitation_token'), $reissued->json('data.invitation_token'));
        Mail::assertSent(InvitationMail::class, 1);
    }

    private function verifiedUser(string $email, string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        app(\App\Core\Identity\EmailVerificationService::class)->requestChallenge($user, $email);
        app(\App\Core\Identity\EmailVerificationService::class)->confirmEmail($user, $this->delivery->lastToken());

        return $user->fresh();
    }
}
