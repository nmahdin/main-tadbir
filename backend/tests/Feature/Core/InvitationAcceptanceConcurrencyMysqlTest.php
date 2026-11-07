<?php

namespace Tests\Feature\Core;

use App\Core\Identity\EmailVerificationDelivery;
use App\Core\Identity\EmailVerificationService;
use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationAcceptanceService;
use App\Core\Invitations\InvitationException;
use App\Core\Invitations\InvitationService;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\RoleProvisioner;
use App\Core\Rbac\ScopedRole;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only acceptance race evidence (Stage C6-2).
 *
 * Acceptance locks the invitation row first: a concurrent
 * acceptance blocks, then observes the committed terminal state
 * (exactly one consumption, exactly one membership set).
 * Revocation racing acceptance has exactly one winner.
 * Suspension racing acceptance serializes on the organization
 * row and cannot commit an unauthorized membership. All
 * assertions rest on committed postconditions.
 */
class InvitationAcceptanceConcurrencyMysqlTest extends TestCase
{
    private CapturingEmailDelivery $delivery;

    /** @var list<int> */
    private array $userIds = [];

    /** @var list<int> */
    private array $organizationIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only concurrency test (SQLite cannot exercise row locks).');
        }

        config(['database.connections.mysql_concurrent' => config('database.connections.mysql')]);
        DB::purge('mysql_concurrent');
        $this->travelTo(CarbonImmutable::parse('2026-06-01T12:00:00Z'));
        $this->delivery = new CapturingEmailDelivery;
        $this->app->instance(EmailVerificationDelivery::class, $this->delivery);
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('core_invitations')->whereIn('organization_id', $this->organizationIds)->delete();
            $workspaceIds = DB::table('workspaces')->whereIn('organization_id', $this->organizationIds)->pluck('id')->all();
            $roleIds = DB::table('core_roles')->whereIn('organization_id', $this->organizationIds)->orWhereIn('workspace_id', $workspaceIds)->pluck('id')->all();
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
            DB::table('core_email_verification_challenges')->whereIn('user_id', $this->userIds)->delete();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $workspaceIds)->delete();
            DB::table('organization_memberships')->whereIn('organization_id', $this->organizationIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $workspaceIds)->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_concurrent_acceptance_consumes_exactly_once(): void
    {
        [$manager, $organization, $workspace, $memberRole, $invitee, $issued] = $this->fixture('race-accept@example.com');
        $acceptance = app(InvitationAcceptanceService::class);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner is mid-acceptance: it holds the invitation row
            // and already created the membership uncommitted.
            $winner->table('core_invitations')->where('id', $issued->invitation->id)->lockForUpdate()->first();
            $winner->table('organization_memberships')->insert([
                'organization_id' => $organization->id, 'user_id' => $invitee->id,
                'role_id' => $memberRole->id, 'status' => 'active',
                'created_at' => now(), 'updated_at' => now(),
            ]);

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $acceptance->accept($invitee, $issued->rawToken);
                $this->fail('Concurrent acceptance must block on the invitation row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }

            $winner->table('core_invitations')->where('id', $issued->invitation->id)->update([
                'status' => CoreInvitation::STATUS_ACCEPTED,
                'accepted_at' => '2026-06-01 12:00:00',
                'accepted_by_user_id' => $invitee->id,
                'status_version' => 2,
            ]);
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        $this->assertAcceptanceCode('invitation_already_accepted', fn () => $acceptance->accept($invitee, $issued->rawToken));
        $this->assertSame(1, DB::table('organization_memberships')->where('organization_id', $organization->id)->where('user_id', $invitee->id)->count(), 'exactly one organization membership committed');
        $this->assertSame(2, (int) $issued->invitation->fresh()->status_version, 'exactly one consumption committed');
    }

    public function test_revocation_wins_over_racing_acceptance(): void
    {
        [$manager, $organization, $workspace, $memberRole, $invitee, $issued] = $this->fixture('race-revoke@example.com');
        $acceptance = app(InvitationAcceptanceService::class);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_invitations')->where('id', $issued->invitation->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $acceptance->accept($invitee, $issued->rawToken);
                $this->fail('Acceptance must block while revocation holds the row.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }

            $winner->table('core_invitations')->where('id', $issued->invitation->id)->update([
                'status' => CoreInvitation::STATUS_REVOKED,
                'revoked_at' => '2026-06-01 12:00:00',
                'revoked_by_user_id' => $manager->id,
                'status_version' => 2,
            ]);
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        $this->assertAcceptanceCode('invitation_revoked', fn () => $acceptance->accept($invitee, $issued->rawToken));
        $this->assertSame(0, DB::table('organization_memberships')->where('user_id', $invitee->id)->count(), 'revoked acceptance committed no membership');
    }

    public function test_suspension_wins_over_racing_acceptance(): void
    {
        [$manager, $organization, $workspace, $memberRole, $invitee, $issued] = $this->fixture('race-suspend@example.com');
        $acceptance = app(InvitationAcceptanceService::class);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Suspension side holds the organization row, as the
            // C3 lifecycle service does.
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $acceptance->accept($invitee, $issued->rawToken);
                $this->fail('Acceptance must block on the organization row lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }

            $winner->table('organizations')->where('id', $organization->id)->update(['status' => 'suspended']);
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        $this->assertAcceptanceCode('invitation_organization_unavailable', fn () => $acceptance->accept($invitee, $issued->rawToken));
        $this->assertSame(0, DB::table('organization_memberships')->where('user_id', $invitee->id)->count(), 'suspended acceptance committed no membership');
        $this->assertSame(CoreInvitation::STATUS_PENDING, $issued->invitation->fresh()->status, 'invitation remains unconsumed');
    }

    /**
     * @return array{0: User, 1: Organization, 2: \App\Core\Workspaces\Workspace, 3: ScopedRole, 4: User, 5: \App\Core\Invitations\IssuedInvitation}
     */
    private function fixture(string $email): array
    {
        $manager = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $manager->id;
        $organization = app(OrganizationProvisioner::class)->create($manager, 'Race Acc '.uniqid());
        $this->organizationIds[] = (int) $organization->id;
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $memberRole = app(RoleProvisioner::class)->organizationMember($organization);

        $invitee = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $invitee->id;
        $verification = app(EmailVerificationService::class);
        $verification->requestChallenge($invitee, $email);
        $verification->confirmEmail($invitee, $this->delivery->lastToken());

        $issued = app(InvitationService::class)->issueOrganizationInvitation($manager, $organization, $email, $memberRole->id);

        return [$manager, $organization, $workspace, $memberRole, $invitee->fresh(), $issued];
    }

    private function assertAcceptanceCode(string $code, callable $operation): void
    {
        try {
            $operation();
            $this->fail("Expected acceptance failure [{$code}].");
        } catch (InvitationException $exception) {
            $this->assertSame($code, $exception->errorCode);
        }
    }
}
