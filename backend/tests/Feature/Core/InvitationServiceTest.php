<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationService;
use App\Core\Invitations\InvitationState;
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
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Invitation issuance, expiry evaluation, and revocation
 * (Stage C6-1). Acceptance is C6-2 and intentionally absent:
 * these tests prove issuance creates NO membership and consumes
 * nothing.
 */
class InvitationServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private Workspace $ws1;

    private Workspace $ws2;

    private ScopedRole $orgManagerRole;

    private ScopedRole $orgMemberRole;

    private ScopedRole $wsMemberRole;

    private ScopedRole $ws2MemberRole;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();

        $this->manager = User::factory()->create(['username' => 'inv_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Invitation Org');
        $this->ws1 = $this->org->workspaces()->where('is_default', true)->firstOrFail();
        $this->ws2 = Workspace::factory()->for($this->org, 'organization')->create(['owner_user_id' => null]);

        $roles = app(RoleProvisioner::class);
        $this->orgManagerRole = $roles->organizationManager($this->org);
        $this->orgMemberRole = $roles->organizationMember($this->org);
        $this->wsMemberRole = $roles->workspaceMember($this->ws1);
        $this->ws2MemberRole = $roles->workspaceMember($this->ws2);
    }

    public function test_organization_issuance_defaults_to_seven_days_and_creates_no_membership(): void
    {
        $service = app(InvitationService::class);
        $membershipsBefore = OrganizationMembership::count();

        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, '  New.Person@Example.COM ', $this->orgMemberRole->id);

        $invitation = $issued->invitation;
        $this->assertSame(CoreInvitation::TYPE_ORGANIZATION, $invitation->type);
        $this->assertSame($this->org->id, (int) $invitation->organization_id);
        $this->assertNull($invitation->workspace_id);
        $this->assertSame('new.person@example.com', $invitation->email_normalized);
        $this->assertSame(CoreInvitation::STATUS_PENDING, $invitation->status);
        $this->assertSame('2026-06-08T12:00:00+00:00', $invitation->expires_at->toIso8601String(), 'default validity is exactly 7 days');
        $this->assertSame(InvitationState::PendingAcceptance, $invitation->effectiveState());
        $this->assertSame($membershipsBefore, OrganizationMembership::count(), 'issuance creates no membership');
        $this->assertSame(0, WorkspaceMembership::query()->where('user_id', '!=', $this->manager->id)->count());

        // Token hygiene: only the hash is persisted; the raw token
        // is >= 256 bits, URL-safe, resolvable exactly once here.
        $this->assertGreaterThanOrEqual(43, strlen($issued->rawToken));
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', $issued->rawToken);
        $this->assertSame(hash('sha256', $issued->rawToken), $invitation->token_hash);
        $this->assertNotSame($issued->rawToken, $invitation->token_hash);
        $this->assertSame($invitation->id, $service->resolveByRawToken($issued->rawToken)?->id);
        $this->assertNull($service->resolveByRawToken('not-the-token'));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $invitation->fresh()->status, 'lookup never consumes');

        $audit = AuditLog::query()->where('action', 'invitation.issued')->sole();
        $this->assertStringNotContainsString($issued->rawToken, (string) json_encode($audit->summary));
        $this->assertStringNotContainsString('new.person@example.com', (string) json_encode($audit->summary), 'audit carries no raw email');
    }

    public function test_workspace_issuance_for_organization_and_personal_workspaces(): void
    {
        $service = app(InvitationService::class);

        $issued = $service->issueWorkspaceInvitation($this->manager, $this->ws1, 'ws@example.com', $this->wsMemberRole->id);
        $this->assertSame(CoreInvitation::TYPE_WORKSPACE, $issued->invitation->type);
        $this->assertSame($this->ws1->id, (int) $issued->invitation->workspace_id);
        $this->assertNull($issued->invitation->organization_id, 'owning organization derives from the workspace at acceptance; it is not stored as client input');

        // Personal workspace: no organization membership invented.
        $owner = User::factory()->create(['username' => 'inv_personal', 'status' => 'active']);
        $personal = app(\App\Core\Workspaces\PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $personalRole = app(RoleProvisioner::class)->workspaceMember($personal);
        $orgMembershipsBefore = OrganizationMembership::count();

        $issuedPersonal = $service->issueWorkspaceInvitation($owner, $personal, 'friend@example.com', $personalRole->id);
        $this->assertSame($personal->id, (int) $issuedPersonal->invitation->workspace_id);
        $this->assertSame($orgMembershipsBefore, OrganizationMembership::count(), 'a personal invitation invents no organization membership');
    }

    public function test_role_validation_wrong_scope_and_grant_ceiling(): void
    {
        $service = app(InvitationService::class);

        $this->assertInvitationFails('invitation_role_invalid', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'a@example.com', 999999));
        $this->assertInvitationFails('invitation_role_scope_mismatch', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'a@example.com', $this->wsMemberRole->id));
        $this->assertInvitationFails('invitation_role_scope_mismatch', fn () => $service->issueWorkspaceInvitation($this->manager, $this->ws1, 'a@example.com', $this->orgMemberRole->id));
        $this->assertInvitationFails('invitation_role_scope_mismatch', fn () => $service->issueWorkspaceInvitation($this->manager, $this->ws1, 'a@example.com', $this->ws2MemberRole->id));

        // Invitation clerk: may invite, but may only grant what it holds.
        $clerk = User::factory()->create(['username' => 'inv_clerk', 'status' => 'active']);
        $clerkRole = ScopedRole::create(['scope' => 'organization', 'organization_id' => $this->org->id, 'key' => 'invite_clerk', 'name' => 'Invite Clerk', 'is_protected' => false]);
        $clerkRole->permissions()->attach(ScopedPermission::whereIn('key', ['organization.view', 'organization.members.manage'])->pluck('id'));
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $clerk->id, 'role_id' => $clerkRole->id, 'status' => MembershipStatus::Active]);

        $service->issueOrganizationInvitation($clerk, $this->org, 'ok@example.com', $this->orgMemberRole->id);
        $this->assertInvitationFails('invitation_grant_ceiling', fn () => $service->issueOrganizationInvitation($clerk, $this->org, 'escalate@example.com', $this->orgManagerRole->id));
        $this->assertSame(0, CoreInvitation::query()->where('email_normalized', 'escalate@example.com')->count(), 'escalation persisted nothing');
    }

    public function test_authority_boundaries_and_no_implicit_privileges(): void
    {
        $service = app(InvitationService::class);

        // Plain organization member (view-only) cannot invite.
        $member = User::factory()->create(['username' => 'inv_member', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $member->id, 'role_id' => $this->orgMemberRole->id, 'status' => MembershipStatus::Active]);
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueOrganizationInvitation($member, $this->org, 'x@example.com', $this->orgMemberRole->id));

        // Default-workspace manager has no authority in the second workspace.
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueWorkspaceInvitation($this->manager, $this->ws2, 'x@example.com', $this->ws2MemberRole->id));

        // Platform primary administrator: platform status grants no scope authority.
        $platformAdmin = User::factory()->create(['username' => 'inv_platform', 'status' => 'active']);
        \App\Core\Platform\PlatformRoleAssignment::create(['user_id' => $platformAdmin->id, 'platform_role_id' => app(\App\Core\Platform\PlatformRoleProvisioner::class)->ensurePrimaryAdministrator()->id]);
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueOrganizationInvitation($platformAdmin, $this->org, 'x@example.com', $this->orgMemberRole->id));
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueWorkspaceInvitation($platformAdmin, $this->ws1, 'x@example.com', $this->wsMemberRole->id));

        // Legacy admin: legacy role confers nothing.
        $legacyRole = \App\Models\Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin', 'is_active' => true]);
        $legacy = User::factory()->create(['username' => 'inv_legacy', 'role_id' => $legacyRole->id, 'role_key' => 'admin', 'status' => 'active']);
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueOrganizationInvitation($legacy, $this->org, 'x@example.com', $this->orgMemberRole->id));

        // Suspended actor account: even scope managers lose invitation authority.
        $this->manager->forceFill(['status' => 'suspended'])->save();
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueOrganizationInvitation($this->manager->fresh(), $this->org, 'x@example.com', $this->orgMemberRole->id));
    }

    public function test_expiry_boundary_is_exact_and_no_cron_is_needed(): void
    {
        $service = app(InvitationService::class);
        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, 'edge@example.com', $this->orgMemberRole->id, new CarbonImmutable('2026-06-03 12:00:00', 'UTC'));

        $this->assertSame(InvitationState::PendingAcceptance, $issued->invitation->effectiveState(new CarbonImmutable('2026-06-03 11:59:59', 'UTC')));
        $this->assertSame(InvitationState::Expired, $issued->invitation->effectiveState(new CarbonImmutable('2026-06-03 12:00:00', 'UTC')), 'at the exact expiry instant the invitation is ineligible');
        $this->assertFalse($issued->invitation->isAcceptanceEligible(new CarbonImmutable('2026-06-03 12:00:00', 'UTC')));

        // Elapsed expiry mutates nothing in storage.
        $this->travelTo(new CarbonImmutable('2026-06-04 00:00:00', 'UTC'));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status);
        $this->assertSame(InvitationState::Expired, $issued->invitation->fresh()->effectiveState());

        $this->assertInvitationFails('invitation_expiry_invalid', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'past@example.com', $this->orgMemberRole->id, new CarbonImmutable('2026-06-01 00:00:00', 'UTC')));
        $this->assertInvitationFails('invitation_expiry_invalid', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'far@example.com', $this->orgMemberRole->id, CarbonImmutable::now('UTC')->addDays(31)));
    }

    public function test_duplicate_pending_conflict_and_reissue_after_expiry(): void
    {
        $service = app(InvitationService::class);
        $service->issueOrganizationInvitation($this->manager, $this->org, 'dup@example.com', $this->orgMemberRole->id);

        $this->assertInvitationFails('invitation_duplicate_pending', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'DUP@example.com', $this->orgMemberRole->id));

        // Different intended role is a different invitation.
        $service->issueOrganizationInvitation($this->manager, $this->org, 'dup@example.com', $this->orgManagerRole->id);

        // After the first expires, reissue is permitted and the
        // expired leftover remains untouched (never silently revoked).
        $this->travelTo(new CarbonImmutable('2026-06-09 00:00:00', 'UTC'));
        $service->issueOrganizationInvitation($this->manager, $this->org, 'dup@example.com', $this->orgMemberRole->id);
        $this->assertSame(3, CoreInvitation::query()->where('email_normalized', 'dup@example.com')->count());
        $this->assertSame(0, CoreInvitation::query()->where('email_normalized', 'dup@example.com')->where('status', CoreInvitation::STATUS_REVOKED)->count(), 'the expired leftover was never silently revoked');
    }

    public function test_revocation_contract_and_expiry_precedence(): void
    {
        $service = app(InvitationService::class);
        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, 'revoke@example.com', $this->orgMemberRole->id);

        // Cross-scope / unauthorized revocation denied.
        $outsider = User::factory()->create(['username' => 'inv_outsider', 'status' => 'active']);
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->revoke($outsider, $issued->invitation));

        $revoked = $service->revoke($this->manager, $issued->invitation);
        $this->assertSame(CoreInvitation::STATUS_REVOKED, $revoked->status);
        $this->assertSame($this->manager->id, (int) $revoked->revoked_by_user_id);
        $this->assertNotNull($revoked->revoked_at);
        $this->assertSame(2, (int) $revoked->status_version);
        $this->assertSame(InvitationState::Revoked, $revoked->effectiveState());
        $this->assertNotNull(AuditLog::query()->where('action', 'invitation.revoked')->first());

        $this->assertInvitationFails('invitation_already_revoked', fn () => $service->revoke($this->manager, $revoked));

        // Accepted invitations cannot be revoked.
        $accepted = $service->issueOrganizationInvitation($this->manager, $this->org, 'acc@example.com', $this->orgMemberRole->id);
        $accepted->invitation->forceFill(['status' => CoreInvitation::STATUS_ACCEPTED, 'accepted_at' => now(), 'accepted_by_user_id' => $outsider->id])->save();
        $this->assertInvitationFails('invitation_already_accepted', fn () => $service->revoke($this->manager, $accepted->invitation->fresh()));

        // Revocation beats expiry: an expired-but-pending invitation
        // can still be revoked and then stays revoked forever.
        $expired = $service->issueOrganizationInvitation($this->manager, $this->org, 'old@example.com', $this->orgMemberRole->id, new CarbonImmutable('2026-06-02 00:00:00', 'UTC'));
        $this->travelTo(new CarbonImmutable('2026-06-05 00:00:00', 'UTC'));
        $this->assertSame(InvitationState::Expired, $expired->invitation->fresh()->effectiveState());
        $revokedLate = $service->revoke($this->manager, $expired->invitation->fresh());
        $this->assertSame(InvitationState::Revoked, $revokedLate->effectiveState(new CarbonImmutable('2027-01-01 00:00:00', 'UTC')));

        // Revocation never deletes memberships.
        $this->assertGreaterThan(0, OrganizationMembership::count());
    }

    public function test_suspended_and_ended_organizations_deny_issuance_and_revocation(): void
    {
        $service = app(InvitationService::class);
        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, 'life@example.com', $this->orgMemberRole->id);
        $wsIssued = $service->issueWorkspaceInvitation($this->manager, $this->ws1, 'life-ws@example.com', $this->wsMemberRole->id);

        $this->org->forceFill(['status' => 'suspended'])->save();
        $this->assertInvitationFails('invitation_organization_unavailable', fn () => $service->issueOrganizationInvitation($this->manager, $this->org->fresh(), 's@example.com', $this->orgMemberRole->id));
        $this->assertInvitationFails('invitation_organization_unavailable', fn () => $service->issueWorkspaceInvitation($this->manager, $this->ws1->fresh(), 's@example.com', $this->wsMemberRole->id));
        $this->assertInvitationFails('invitation_organization_unavailable', fn () => $service->revoke($this->manager, $issued->invitation->fresh()));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status, 'denied revocation changed nothing');

        $this->org->forceFill(['status' => 'ended'])->save();
        $this->assertInvitationFails('invitation_organization_unavailable', fn () => $service->issueOrganizationInvitation($this->manager, $this->org->fresh(), 'e@example.com', $this->orgMemberRole->id));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $wsIssued->invitation->fresh()->status);
    }

    public function test_audit_failure_rolls_back_issuance_and_revocation(): void
    {
        $service = app(InvitationService::class);
        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, 'keep@example.com', $this->orgMemberRole->id);

        AuditLog::creating(function (): void {
            throw new \RuntimeException('simulated audit failure');
        });

        try {
            $service->issueOrganizationInvitation($this->manager, $this->org, 'rollback@example.com', $this->orgMemberRole->id);
            $this->fail('expected audit failure');
        } catch (\RuntimeException) {
            // expected
        }

        try {
            $service->revoke($this->manager, $issued->invitation);
            $this->fail('expected audit failure');
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertSame(0, CoreInvitation::query()->where('email_normalized', 'rollback@example.com')->count());
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status);
    }

    public function test_invalid_email_and_immutable_intent(): void
    {
        $service = app(InvitationService::class);
        $this->assertInvitationFails('invitation_email_invalid', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'not-an-email', $this->orgMemberRole->id));

        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, 'immut@example.com', $this->orgMemberRole->id);

        try {
            $issued->invitation->forceFill(['intended_organization_role_id' => $this->orgManagerRole->id])->save();
            $this->fail('role intent must be immutable');
        } catch (\DomainException) {
            // expected — corrections happen by revoke + reissue.
        }
    }

    public function test_combined_issuance_with_dual_authority_and_intent(): void
    {
        $service = app(InvitationService::class);
        $orgMembershipsBefore = OrganizationMembership::count();
        $wsMembershipsBefore = WorkspaceMembership::count();
        $wsManagerRole = app(RoleProvisioner::class)->workspaceManager($this->ws1);

        $issued = $service->issueCombinedInvitation(
            $this->manager, $this->ws1, 'combo@example.com',
            $this->orgMemberRole->id, $this->wsMemberRole->id, '  Welcome <b>aboard</b>!  ',
        );

        $invitation = $issued->invitation;
        $this->assertSame(CoreInvitation::TYPE_COMBINED, $invitation->type);
        $this->assertSame($this->org->id, (int) $invitation->organization_id, 'organization derives from the persisted workspace owner');
        $this->assertSame($this->ws1->id, (int) $invitation->workspace_id);
        $this->assertSame($this->orgMemberRole->id, (int) $invitation->intended_organization_role_id);
        $this->assertSame($this->wsMemberRole->id, (int) $invitation->intended_workspace_role_id);
        $this->assertSame('Welcome aboard!', $invitation->message, 'message is trimmed and markup-stripped');
        $this->assertTrue($invitation->willCreateOrganizationMembership());
        $this->assertSame($orgMembershipsBefore, OrganizationMembership::count(), 'combined issuance creates no membership yet');
        $this->assertSame($wsMembershipsBefore, WorkspaceMembership::count());

        // Role scope checks are independent per role.
        $this->assertInvitationFails('invitation_role_scope_mismatch', fn () => $service->issueCombinedInvitation($this->manager, $this->ws1, 'c2@example.com', $this->wsMemberRole->id, $this->wsMemberRole->id));
        $this->assertInvitationFails('invitation_role_scope_mismatch', fn () => $service->issueCombinedInvitation($this->manager, $this->ws1, 'c3@example.com', $this->orgMemberRole->id, $this->ws2MemberRole->id));

        // Grant Ceiling binds per scope: a trusted org manager who
        // is only a workspace member cannot grant workspace manager.
        $wsManager = app(RoleProvisioner::class)->workspaceManager($this->ws1);
        $this->assertSame($wsManager->id, $wsManagerRole->id);
    }

    public function test_combined_requires_both_authorities_and_own_workspace(): void
    {
        $service = app(InvitationService::class);

        // Organization authority without workspace authority.
        $orgOnly = User::factory()->create(['username' => 'inv_org_only', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $orgOnly->id, 'role_id' => $this->orgManagerRole->id, 'status' => MembershipStatus::Active]);
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueCombinedInvitation($orgOnly, $this->ws1, 'a@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id));

        // Workspace authority without organization authority.
        $wsOnly = User::factory()->create(['username' => 'inv_ws_only', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $wsOnly->id, 'role_id' => $this->orgMemberRole->id, 'status' => MembershipStatus::Active]);
        $wsManagerRole = app(RoleProvisioner::class)->workspaceManager($this->ws1);
        WorkspaceMembership::create(['workspace_id' => $this->ws1->id, 'user_id' => $wsOnly->id, 'role_id' => $wsManagerRole->id, 'status' => MembershipStatus::Active]);
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueCombinedInvitation($wsOnly, $this->ws1, 'b@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id));

        // Independent ceiling: workspace-manager *member* (lacks
        // workspace roles) cannot grant the workspace manager role
        // even with full organization authority.
        $orgManagerWsMember = $orgOnly;
        WorkspaceMembership::create(['workspace_id' => $this->ws1->id, 'user_id' => $orgManagerWsMember->id, 'role_id' => $this->wsMemberRole->id, 'status' => MembershipStatus::Active]);
        // (membership exists now but with Member role: workspace
        // authority workspace.members.manage is missing) -> forbidden
        $this->assertInvitationFails('invitation_forbidden', fn () => $service->issueCombinedInvitation($orgManagerWsMember, $this->ws1, 'c@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id));

        // Combined on a personal workspace is not a valid intent.
        $owner = User::factory()->create(['username' => 'inv_combo_personal', 'status' => 'active']);
        $personal = app(\App\Core\Workspaces\PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $personalWsRole = app(RoleProvisioner::class)->workspaceMember($personal);
        $this->assertInvitationFails('invitation_scope_invalid', fn () => $service->issueCombinedInvitation($owner, $personal, 'd@example.com', $this->orgMemberRole->id, $personalWsRole->id));
    }

    public function test_message_limits_and_public_presentation_privacy(): void
    {
        $service = app(InvitationService::class);

        $this->assertInvitationFails('invitation_message_too_long', fn () => $service->issueOrganizationInvitation($this->manager, $this->org, 'long@example.com', $this->orgMemberRole->id, str_repeat('x', 1001)));

        // Only explicitly-public settings surface in the DTO.
        $this->org->forceFill(['settings' => ['public' => ['description' => 'We build things.', 'logo_url' => 'https://example.com/logo.png'], 'secret_note' => 'internal-only']])->save();
        $issued = $service->issueCombinedInvitation($this->manager, $this->ws1, 'present@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id, 'See you soon');

        $dto = app(\App\Core\Invitations\InvitationPresenter::class)->present($issued->invitation->fresh())->toArray();
        $json = (string) json_encode($dto);

        $this->assertSame('combined', $dto['invitation']['type']);
        $this->assertSame('pending', $dto['invitation']['status']);
        $this->assertTrue($dto['invitation']['will_create_organization_membership']);
        $this->assertSame($this->org->name, $dto['organization']['name']);
        $this->assertSame('We build things.', $dto['organization']['description']);
        $this->assertSame('https://example.com/logo.png', $dto['organization']['logo_url']);
        $this->assertSame($this->ws1->name, $dto['workspace']['name']);
        $this->assertSame($this->manager->name, $dto['inviter']['name']);
        $this->assertSame($this->orgMemberRole->name, $dto['intended_organization_role']['name']);
        $this->assertSame($this->wsMemberRole->name, $dto['intended_workspace_role']['name']);
        $this->assertSame('See you soon', $dto['message']);

        $this->assertStringNotContainsString('internal-only', $json, 'private settings never surface');
        $this->assertStringNotContainsString('present@example.com', $json, 'invitee email never surfaces');
        $this->assertStringNotContainsString($issued->rawToken, $json, 'raw token never surfaces');
        $this->assertStringNotContainsString($issued->invitation->token_hash, $json, 'token hash never surfaces');
        $this->assertStringNotContainsString('"id"', $json, 'no internal identifiers');
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status, 'presenting never consumes');
    }

    private function assertInvitationFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected invitation failure [{$code}].");
        } catch (\App\Core\Invitations\InvitationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
