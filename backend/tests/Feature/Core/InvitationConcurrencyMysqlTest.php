<?php

namespace Tests\Feature\Core;

use App\Core\Invitations\CoreInvitation;
use App\Core\Invitations\InvitationException;
use App\Core\Invitations\InvitationService;
use App\Core\Organizations\Organization;
use App\Core\Organizations\OrganizationProvisioner;
use App\Core\Rbac\RoleProvisioner;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only invitation concurrency evidence (Stage C6-1).
 *
 * Revocation locks the invitation row; concurrent revocations
 * serialize and the loser observes the committed terminal state
 * (`invitation_already_revoked`). Issuance locks the
 * scope-container (organization) row first; a concurrent issue
 * blocks, then re-evaluates the duplicate rule against committed
 * state (`invitation_duplicate_pending`). All assertions rest on
 * committed postconditions.
 */
class InvitationConcurrencyMysqlTest extends TestCase
{
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
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('core_invitations')->whereIn('organization_id', $this->organizationIds)->delete();
            $workspaceIds = DB::table('workspaces')->whereIn('organization_id', $this->organizationIds)->pluck('id')->all();
            $roleIds = DB::table('core_roles')->whereIn('organization_id', $this->organizationIds)->orWhereIn('workspace_id', $workspaceIds)->pluck('id')->all();
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
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

    public function test_concurrent_revocations_serialize_on_the_invitation_row(): void
    {
        [$manager, $organization, $service, $memberRole] = $this->fixture('race-revoke');
        $issued = $service->issueOrganizationInvitation($manager, $organization, 'revoke-race@example.com', $memberRole->id);

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            $winner->table('core_invitations')->where('id', $issued->invitation->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $service->revoke($manager, $issued->invitation);
                $this->fail('Revocation must block on the invitation row lock.');
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

        try {
            $service->revoke($manager, $issued->invitation->fresh());
            $this->fail('Second revocation must observe the committed terminal state.');
        } catch (InvitationException $exception) {
            $this->assertSame('invitation_already_revoked', $exception->errorCode);
        }

        $fresh = $issued->invitation->fresh();
        $this->assertSame(CoreInvitation::STATUS_REVOKED, $fresh->status);
        $this->assertSame(2, (int) $fresh->status_version, 'exactly one revocation was committed');
    }

    public function test_duplicate_issuance_serializes_on_the_scope_lock(): void
    {
        [$manager, $organization, $service, $memberRole] = $this->fixture('race-issue');

        $winner = DB::connection('mysql_concurrent');
        $winner->beginTransaction();
        try {
            // Winner holds the scope-container (organization) row,
            // as issuance does before its duplicate check.
            $winner->table('organizations')->where('id', $organization->id)->lockForUpdate()->first();

            DB::statement('SET SESSION innodb_lock_wait_timeout = 2');
            try {
                $service->issueOrganizationInvitation($manager, $organization, 'dup-race@example.com', $memberRole->id);
                $this->fail('Issuance must block on the scope lock.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('1205', $exception->getMessage());
            }

            $winner->table('core_invitations')->insert([
                'type' => 'organization',
                'organization_id' => $organization->id,
                'workspace_id' => null,
                'email_normalized' => 'dup-race@example.com',
                'token_hash' => hash('sha256', 'winner-token'),
                'status' => 'pending',
                'intended_organization_role_id' => $memberRole->id,
                'intended_workspace_role_id' => null,
                'invited_by_user_id' => $manager->id,
                'expires_at' => '2026-06-08 12:00:00',
                'status_version' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $winner->commit();
        } catch (\Throwable $exception) {
            $winner->rollBack();
            throw $exception;
        }

        try {
            $service->issueOrganizationInvitation($manager, $organization, 'dup-race@example.com', $memberRole->id);
            $this->fail('Duplicate issue must observe the committed pending invitation.');
        } catch (InvitationException $exception) {
            $this->assertSame('invitation_duplicate_pending', $exception->errorCode);
        }

        $this->assertSame(1, CoreInvitation::query()->where('email_normalized', 'dup-race@example.com')->count(), 'exactly one pending invitation was committed');
    }

    /**
     * @return array{0: User, 1: Organization, 2: InvitationService, 3: \App\Core\Rbac\ScopedRole}
     */
    private function fixture(string $label): array
    {
        $manager = User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $manager->id;
        $organization = app(OrganizationProvisioner::class)->create($manager, 'Race Inv '.uniqid());
        $this->organizationIds[] = (int) $organization->id;
        $memberRole = app(RoleProvisioner::class)->organizationMember($organization);

        return [$manager, $organization, app(InvitationService::class), $memberRole];
    }
}
