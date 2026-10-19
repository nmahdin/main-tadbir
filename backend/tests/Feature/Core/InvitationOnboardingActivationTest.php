<?php

namespace Tests\Feature\Core;

use App\Core\Audit\AuditLog;
use App\Core\Identity\EmailVerificationDelivery;
use App\Core\Identity\EmailVerificationService;
use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationService;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationMembership;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\PermissionCatalog;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedRole;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * C6 policy amendment — invitation onboarding must not require
 * manual account activation. A pending account may authenticate
 * and reach ONLY the email-verification endpoints; when its
 * verified address matches a live pending invitation, the account
 * becomes eligible for acceptance (activated) — without ever
 * auto-accepting the invitation and without touching any other
 * account status.
 */
class InvitationOnboardingActivationTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Organization $org;

    private ScopedRole $orgMemberRole;

    private CapturingEmailDelivery $delivery;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(new CarbonImmutable('2026-06-01 12:00:00', 'UTC'));
        PermissionCatalog::sync();
        $this->delivery = new CapturingEmailDelivery;
        $this->app->instance(EmailVerificationDelivery::class, $this->delivery);

        $this->manager = User::factory()->create(['username' => 'onb_manager', 'status' => 'active']);
        $this->org = app(OrganizationProvisioner::class)->create($this->manager, 'Onboarding Org');
        $this->orgMemberRole = app(RoleProvisioner::class)->organizationMember($this->org);
    }

    public function test_pending_invitee_registers_verifies_and_accepts_without_manual_activation(): void
    {
        $issued = app(InvitationService::class)->issueOrganizationInvitation($this->manager, $this->org, 'invitee@example.com', $this->orgMemberRole->id);

        // Registration through the public endpoint creates a pending account.
        $chosenPassword = Str::random(32);
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Invited User',
            'username' => 'invited.user',
            'password' => $chosenPassword,
            'password_confirmation' => $chosenPassword,
            'terms_accepted' => true,
            'terms_version' => (string) config('auth.terms.current_version'),
        ])->assertCreated();
        $invitee = User::query()->where('username', 'invited.user')->firstOrFail();
        $this->assertSame('pending', $invitee->status);

        // Pending users may now authenticate (username auth preserved)…
        $this->postJson('/api/v1/auth/login', ['login' => 'invited.user', 'password' => $chosenPassword])->assertOk();
        // …but login alone changes nothing.
        $this->assertSame('pending', $invitee->fresh()->status);

        Sanctum::actingAs($invitee);

        // Pending users can reach the verification surface only.
        $this->getJson('/api/v1/auth/me')->assertForbidden();
        $this->getJson('/api/v1/core/organizations')->assertForbidden();
        $this->getJson('/api/v1/auth/email/verification')->assertOk()->assertJsonPath('data.email_verified', false);
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'invitee@example.com'])->assertStatus(202);
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $this->delivery->lastToken()])
            ->assertOk()->assertJsonPath('data.email_verified', true);

        // Verification against the live invitation activated the
        // account — but never accepted the invitation.
        $this->assertSame('active', $invitee->fresh()->status);
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status);
        $this->assertSame(0, OrganizationMembership::query()->where('user_id', $invitee->id)->count());
        $this->assertNotNull(AuditLog::query()->where('action', 'identity.account_activated_via_invitation')->first());

        // Explicit acceptance now succeeds with the real navigation target.
        $this->postJson('/api/v1/invitations/accept', ['token' => $issued->rawToken])
            ->assertOk()
            ->assertJsonPath('data.navigation_target.type', 'organization')
            ->assertJsonPath('data.navigation_target.id', $this->org->id)
            ->assertJsonPath('data.created_organization_membership', true);
        $this->assertSame(1, OrganizationMembership::query()->where('user_id', $invitee->id)->count());
    }

    public function test_verification_without_a_live_invitation_does_not_activate(): void
    {
        $user = User::factory()->create(['username' => 'onb_noinvite', 'status' => 'pending']);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'noinvite@example.com'])->assertStatus(202);
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $this->delivery->lastToken()])->assertOk();

        $this->assertSame('pending', $user->fresh()->status, 'verification alone is not self-activation');
        $this->assertNull(AuditLog::query()->where('action', 'identity.account_activated_via_invitation')->first());
        // Still no operational access and no acceptance surface.
        $this->getJson('/api/v1/core/organizations')->assertForbidden();
    }

    public function test_revoked_or_expired_invitations_do_not_activate(): void
    {
        $revoked = app(InvitationService::class)->issueOrganizationInvitation($this->manager, $this->org, 'revoked@example.com', $this->orgMemberRole->id);
        app(InvitationService::class)->revoke($this->manager, $revoked->invitation);

        $user = User::factory()->create(['username' => 'onb_revoked', 'status' => 'pending']);
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'revoked@example.com'])->assertStatus(202);
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $this->delivery->lastToken()])->assertOk();
        $this->assertSame('pending', $user->fresh()->status);

        app(InvitationService::class)->issueOrganizationInvitation(
            $this->manager, $this->org, 'expired@example.com', $this->orgMemberRole->id,
            expiresAt: CarbonImmutable::now('UTC')->addHour(),
        );
        $user2 = User::factory()->create(['username' => 'onb_expired', 'status' => 'pending']);
        Sanctum::actingAs($user2);
        // Challenge issued at 12:59 (valid until 13:29); confirmation
        // happens at 13:15 — after the invitation's 13:00 expiry.
        $this->travelTo(new CarbonImmutable('2026-06-01 12:59:00', 'UTC'));
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 'expired@example.com'])->assertStatus(202);
        $this->travelTo(new CarbonImmutable('2026-06-01 13:15:00', 'UTC'));
        $this->postJson('/api/v1/auth/email/verification/confirm', ['token' => $this->delivery->lastToken()])->assertOk();
        $this->assertSame('pending', $user2->fresh()->status);
    }

    public function test_suspension_and_deactivation_controls_are_not_weakened(): void
    {
        // Login still denies every non-pending, non-active status.
        $fixturePassword = Str::random(32);
        foreach (['blocked', 'inactive', 'suspended', 'deactivated'] as $status) {
            $user = User::factory()->create([
                'username' => 'onb_'.$status,
                'password' => Hash::make($fixturePassword),
                'status' => $status,
            ]);
            $this->postJson('/api/v1/auth/login', ['login' => $user->username, 'password' => $fixturePassword])->assertForbidden();
            $this->assertSame($status, $user->fresh()->status);
        }

        // A challenge issued while active never reactivates a
        // deactivated or suspended account at confirmation time.
        foreach (['deactivated', 'suspended'] as $status) {
            $user = User::factory()->create(['username' => 'onb_late_'.$status, 'status' => 'active']);
            app(EmailVerificationService::class)->requestChallenge($user, 'late'.$status.'@example.com');
            $token = $this->delivery->lastToken();
            $user->forceFill(['status' => $status])->save();

            app(EmailVerificationService::class)->confirmEmail($user, $token);
            $this->assertSame($status, $user->fresh()->status, 'verification never reverses lifecycle controls');
        }

        // Suspended users get no verification-endpoint exception either.
        $suspended = User::factory()->create(['username' => 'onb_suspended_api', 'status' => 'suspended']);
        Sanctum::actingAs($suspended);
        $this->postJson('/api/v1/auth/email/verification/request', ['email' => 's@example.com'])->assertForbidden();
    }
}
