<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Identity\EmailVerificationDelivery;
use App\Core\Identity\EmailVerificationService;
use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationAcceptanceService;
use App\Core\Invitations\InvitationException;
use App\Core\Invitations\InvitationService;
use App\Core\Memberships\MembershipStatus;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedPermission;
use App\Core\Rbac\ScopedRole;
use App\Core\Workspaces\PersonalWorkspaceProvisioner;
use App\Core\Workspaces\Workspace;
use App\Core\Workspaces\WorkspaceMembership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Atomic invitation acceptance (Stage C6-2).
 */
class InvitationAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    private CapturingEmailDelivery $delivery;

    private User $manager;

    private Organization $org;

    private Workspace $ws1;

    private ScopedRole $orgManagerRole;

    private ScopedRole $orgMemberRole;

    private ScopedRole $wsManagerRole;

    private ScopedRole $wsMemberRole;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();
        $this->delivery = new CapturingEmailDelivery;
        $this->app->instance(EmailVerificationDelivery::class, $this->delivery);

        $this->manager = User::factory()->create(['username' => 'acc_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Acceptance Org');
        $this->ws1 = $this->org->workspaces()->where('is_default', true)->firstOrFail();

        $roles = app(RoleProvisioner::class);
        $this->orgManagerRole = $roles->organizationManager($this->org);
        $this->orgMemberRole = $roles->organizationMember($this->org);
        $this->wsManagerRole = $roles->workspaceManager($this->ws1);
        $this->wsMemberRole = $roles->workspaceMember($this->ws1);
    }

    public function test_organization_acceptance_creates_only_organization_membership(): void
    {
        $issued = app(InvitationService::class)->issueOrganizationInvitation($this->manager, $this->org, 'joiner@example.com', $this->orgMemberRole->id);
        $invitee = $this->verifiedUser('joiner@example.com', 'acc_joiner');
        $wsMembershipsBefore = WorkspaceMembership::count();

        // Viewing / looking up the invitation consumes nothing.
        app(InvitationService::class)->resolveByRawToken($issued->rawToken);
        app(\App\Core\Invitations\InvitationPresenter::class)->present($issued->invitation);
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status);

        $result = app(InvitationAcceptanceService::class)->accept($invitee, $issued->rawToken);

        $this->assertTrue($result->createdOrganizationMembership);
        $this->assertFalse($result->createdWorkspaceMembership);
        $this->assertSame(['type' => 'organization', 'id' => $this->org->id], $result->navigationTarget());

        $membership = OrganizationMembership::query()->where('organization_id', $this->org->id)->where('user_id', $invitee->id)->sole();
        $this->assertSame($this->orgMemberRole->id, (int) $membership->role_id);
        $this->assertSame($wsMembershipsBefore, WorkspaceMembership::count(), 'organization invitations never create workspace membership');

        $fresh = $issued->invitation->fresh();
        $this->assertSame(CoreInvitation::STATUS_ACCEPTED, $fresh->status);
        $this->assertSame($invitee->id, (int) $fresh->accepted_by_user_id);
        $this->assertNotNull(AuditLog::query()->where('action', 'invitation.accepted')->first());

        // Repeat acceptance: rejected, never duplicated.
        $this->assertAcceptanceFails('invitation_already_accepted', fn () => app(InvitationAcceptanceService::class)->accept($invitee, $issued->rawToken));
        $this->assertSame(1, OrganizationMembership::query()->where('organization_id', $this->org->id)->where('user_id', $invitee->id)->count());
    }

    public function test_workspace_acceptance_requires_the_organization_prerequisite(): void
    {
        $issued = app(InvitationService::class)->issueWorkspaceInvitation($this->manager, $this->ws1, 'wsonly@example.com', $this->wsMemberRole->id);
        $invitee = $this->verifiedUser('wsonly@example.com', 'acc_wsonly');
        $service = app(InvitationAcceptanceService::class);

        $this->assertAcceptanceFails('invitation_prerequisite_missing', fn () => $service->accept($invitee, $issued->rawToken));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status, 'failed acceptance never consumes');
        $this->assertSame(0, WorkspaceMembership::query()->where('user_id', $invitee->id)->count());

        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $invitee->id, 'role_id' => $this->orgMemberRole->id, 'status' => MembershipStatus::Active]);

        $result = $service->accept($invitee, $issued->rawToken);
        $this->assertFalse($result->createdOrganizationMembership, 'workspace-only never creates organization membership');
        $this->assertTrue($result->createdWorkspaceMembership);
        $membership = WorkspaceMembership::query()->where('workspace_id', $this->ws1->id)->where('user_id', $invitee->id)->sole();
        $this->assertSame($this->wsMemberRole->id, (int) $membership->role_id);
    }

    public function test_combined_acceptance_for_new_and_existing_organization_members(): void
    {
        $service = app(InvitationService::class);
        $acceptance = app(InvitationAcceptanceService::class);

        // Brand-new member: both memberships, both intended roles.
        $issued = $service->issueCombinedInvitation($this->manager, $this->ws1, 'newbie@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id);
        $newbie = $this->verifiedUser('newbie@example.com', 'acc_newbie');
        $result = $acceptance->accept($newbie, $issued->rawToken);
        $this->assertTrue($result->createdOrganizationMembership);
        $this->assertTrue($result->createdWorkspaceMembership);
        $this->assertSame(['type' => 'workspace', 'id' => $this->ws1->id], $result->navigationTarget());
        $this->assertSame(0, WorkspaceMembership::query()->where('user_id', $newbie->id)->where('workspace_id', '!=', $this->ws1->id)->count(), 'no membership in unrelated workspaces');

        // Existing organization member: organization role preserved
        // (manager stays manager), workspace membership created.
        $existing = $this->verifiedUser('veteran@example.com', 'acc_veteran');
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $existing->id, 'role_id' => $this->orgManagerRole->id, 'status' => MembershipStatus::Active]);
        $issued2 = $service->issueCombinedInvitation($this->manager, $this->ws1, 'veteran@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id);
        $result2 = $acceptance->accept($existing, $issued2->rawToken);
        $this->assertFalse($result2->createdOrganizationMembership);
        $this->assertTrue($result2->preservedExistingOrganizationRole);
        $this->assertTrue($result2->createdWorkspaceMembership);
        $orgMembership = OrganizationMembership::query()->where('organization_id', $this->org->id)->where('user_id', $existing->id)->sole();
        $this->assertSame($this->orgManagerRole->id, (int) $orgMembership->role_id, 'existing organization role is never replaced or elevated');
    }

    public function test_email_matching_and_token_state_failures_fail_closed(): void
    {
        $service = app(InvitationService::class);
        $acceptance = app(InvitationAcceptanceService::class);
        $issued = $service->issueOrganizationInvitation($this->manager, $this->org, 'right@example.com', $this->orgMemberRole->id);

        // Verified but wrong email.
        $wrong = $this->verifiedUser('wrong@example.com', 'acc_wrong');
        $this->assertAcceptanceFails('invitation_email_mismatch', fn () => $acceptance->accept($wrong, $issued->rawToken));

        // Claimed but unverified email.
        $unverified = User::factory()->create(['username' => 'acc_unverified', 'status' => 'active']);
        app(EmailVerificationService::class)->requestChallenge($unverified, 'right@example.com');
        $this->assertAcceptanceFails('invitation_email_mismatch', fn () => $acceptance->accept($unverified, $issued->rawToken));

        // Unknown token.
        $this->assertAcceptanceFails('invitation_not_found', fn () => $acceptance->accept($wrong, 'no-such-token'));

        // Revoked invitation.
        $revocable = $service->issueOrganizationInvitation($this->manager, $this->org, 'rev@example.com', $this->orgMemberRole->id);
        $service->revoke($this->manager, $revocable->invitation);
        $revInvitee = $this->verifiedUser('rev@example.com', 'acc_rev');
        $this->assertAcceptanceFails('invitation_revoked', fn () => $acceptance->accept($revInvitee, $revocable->rawToken));

        // Exact expiry boundary: at expires_at, ineligible.
        $expiring = $service->issueOrganizationInvitation($this->manager, $this->org, 'edge@example.com', $this->orgMemberRole->id, null, new CarbonImmutable('2026-06-02 12:00:00', 'UTC'));
        $edge = $this->verifiedUser('edge@example.com', 'acc_edge');
        $this->travelTo(new CarbonImmutable('2026-06-02 12:00:00', 'UTC'));
        $this->assertAcceptanceFails('invitation_expired', fn () => $acceptance->accept($edge, $expiring->rawToken));
    }

    public function test_inviter_authority_loss_and_ceiling_drift_fail_closed(): void
    {
        $service = app(InvitationService::class);
        $acceptance = app(InvitationAcceptanceService::class);

        // Inviter loses organization membership after issuance.
        $inviter = User::factory()->create(['username' => 'acc_inviter', 'status' => 'active']);
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $inviter->id, 'role_id' => $this->orgManagerRole->id, 'status' => MembershipStatus::Active]);
        WorkspaceMembership::create(['workspace_id' => $this->ws1->id, 'user_id' => $inviter->id, 'role_id' => $this->wsManagerRole->id, 'status' => MembershipStatus::Active]);
        $issued = $service->issueOrganizationInvitation($inviter, $this->org, 'orphan@example.com', $this->orgMemberRole->id);
        $invitee = $this->verifiedUser('orphan@example.com', 'acc_orphan');

        OrganizationMembership::query()->where('organization_id', $this->org->id)->where('user_id', $inviter->id)
            ->update(['status' => MembershipStatus::Ended->value, 'role_id' => null]);

        $this->assertAcceptanceFails('invitation_inviter_authority_lost', fn () => $acceptance->accept($invitee, $issued->rawToken));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status);

        // Ceiling drift: intended role gains a permission the
        // inviter (invitation clerk) does not hold.
        $clerk = User::factory()->create(['username' => 'acc_clerk', 'status' => 'active']);
        $clerkRole = ScopedRole::create(['scope' => 'organization', 'organization_id' => $this->org->id, 'key' => 'acc_clerk', 'name' => 'Clerk', 'is_protected' => false]);
        $clerkRole->permissions()->attach(ScopedPermission::whereIn('key', ['organization.view', 'organization.members.manage'])->pluck('id'));
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $clerk->id, 'role_id' => $clerkRole->id, 'status' => MembershipStatus::Active]);

        $issued2 = $service->issueOrganizationInvitation($clerk, $this->org, 'drift@example.com', $this->orgMemberRole->id);
        $drifter = $this->verifiedUser('drift@example.com', 'acc_drifter');
        $this->orgMemberRole->permissions()->attach(ScopedPermission::where('key', 'organization.roles.manage')->sole()->id);

        $this->assertAcceptanceFails('invitation_grant_ceiling', fn () => $acceptance->accept($drifter, $issued2->rawToken));
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued2->invitation->fresh()->status);
    }

    public function test_suspension_and_conflicts_and_personal_workspace(): void
    {
        $service = app(InvitationService::class);
        $acceptance = app(InvitationAcceptanceService::class);

        // Workspace-role conflict: existing active membership with
        // a different role is never silently changed.
        $conflicted = $this->verifiedUser('conflict@example.com', 'acc_conflict');
        OrganizationMembership::create(['organization_id' => $this->org->id, 'user_id' => $conflicted->id, 'role_id' => $this->orgMemberRole->id, 'status' => MembershipStatus::Active]);
        WorkspaceMembership::create(['workspace_id' => $this->ws1->id, 'user_id' => $conflicted->id, 'role_id' => $this->wsManagerRole->id, 'status' => MembershipStatus::Active]);
        $issued = $service->issueWorkspaceInvitation($this->manager, $this->ws1, 'conflict@example.com', $this->wsMemberRole->id);
        $this->assertAcceptanceFails('invitation_membership_conflict', fn () => $acceptance->accept($conflicted, $issued->rawToken));
        $kept = WorkspaceMembership::query()->where('workspace_id', $this->ws1->id)->where('user_id', $conflicted->id)->sole();
        $this->assertSame($this->wsManagerRole->id, (int) $kept->role_id, 'existing role assignment untouched');

        // Suspended organization denies acceptance.
        $doomed = $service->issueCombinedInvitation($this->manager, $this->ws1, 'doomed@example.com', $this->orgMemberRole->id, $this->wsMemberRole->id);
        $doomedInvitee = $this->verifiedUser('doomed@example.com', 'acc_doomed');
        $this->org->forceFill(['status' => 'suspended'])->save();
        $this->assertAcceptanceFails('invitation_organization_unavailable', fn () => $acceptance->accept($doomedInvitee, $doomed->rawToken));
        $this->assertSame(0, OrganizationMembership::query()->where('user_id', $doomedInvitee->id)->count());
        $this->org->forceFill(['status' => 'active'])->save();

        // Personal workspace: invitation from the owner, accepted
        // without any organization involvement.
        $owner = User::factory()->create(['username' => 'acc_powner', 'status' => 'active']);
        $personal = app(PersonalWorkspaceProvisioner::class)->ensureDefault($owner);
        $personalRole = app(RoleProvisioner::class)->workspaceMember($personal);
        $pIssued = $service->issueWorkspaceInvitation($owner, $personal, 'pal@example.com', $personalRole->id);
        $pal = $this->verifiedUser('pal@example.com', 'acc_pal');
        $result = $acceptance->accept($pal, $pIssued->rawToken);
        $this->assertTrue($result->createdWorkspaceMembership);
        $this->assertSame(0, OrganizationMembership::query()->where('user_id', $pal->id)->count(), 'personal acceptance invents no organization membership');
    }

    public function test_audit_failure_rolls_back_memberships_and_consumption(): void
    {
        $issued = app(InvitationService::class)->issueOrganizationInvitation($this->manager, $this->org, 'atomic@example.com', $this->orgMemberRole->id);
        $invitee = $this->verifiedUser('atomic@example.com', 'acc_atomic');

        AuditLog::creating(function (): void {
            throw new \RuntimeException('simulated audit failure');
        });

        try {
            app(InvitationAcceptanceService::class)->accept($invitee, $issued->rawToken);
            $this->fail('expected audit failure');
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertSame(0, OrganizationMembership::query()->where('user_id', $invitee->id)->count(), 'membership rolled back');
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status, 'invitation not consumed');
    }

    private function verifiedUser(string $email, string $username): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => 'active']);
        $service = app(EmailVerificationService::class);
        $service->requestChallenge($user, $email);
        $service->confirmEmail($user, $this->delivery->lastToken());

        return $user->fresh();
    }

    private function assertAcceptanceFails(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected acceptance failure [{$code}].");
        } catch (InvitationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
