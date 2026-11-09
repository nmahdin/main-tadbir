<?php

namespace Tests\Feature\Core;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * MySQL-only schema evidence for Stage C6-1: scope/status CHECKs,
 * token-hash uniqueness, and restrictive foreign keys on
 * `core_invitations` (SQLite cannot enforce the CHECK set; the
 * equivalent domain rules are covered on SQLite by the model
 * guard and InvitationServiceTest).
 */
class InvitationSchemaMysqlTest extends TestCase
{
    /** @var list<int> */
    private array $userIds = [];

    /** @var list<int> */
    private array $organizationIds = [];

    /** @var list<int> */
    private array $invitationIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('MySQL-only schema test (SQLite cannot enforce these CHECK constraints).');
        }
    }

    protected function tearDown(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::table('core_invitations')->whereIn('id', $this->invitationIds)->delete();
            $workspaceIds = DB::table('workspaces')->whereIn('organization_id', $this->organizationIds)->pluck('id')->all();
            $roleIds = DB::table('core_roles')->whereIn('organization_id', $this->organizationIds)->orWhereIn('workspace_id', $workspaceIds)->pluck('id')->all();
            DB::table('core_role_permissions')->whereIn('role_id', $roleIds)->delete();
            DB::table('workspace_memberships')->whereIn('workspace_id', $workspaceIds)->delete();
            DB::table('organization_memberships')->whereIn('organization_id', $this->organizationIds)->delete();
            DB::table('core_roles')->whereIn('id', $roleIds)->delete();
            DB::table('workspaces')->whereIn('id', $workspaceIds)->delete();
            DB::table('audit_logs')->whereIn('actor_user_id', $this->userIds)->delete();
            DB::table('organizations')->whereIn('id', $this->organizationIds)->delete();
            DB::table('platform_role_assignments')->whereIn('user_id', $this->userIds)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }

        parent::tearDown();
    }

    public function test_scope_status_uniqueness_and_restrictive_foreign_keys(): void
    {
        $creator = \App\Models\User::factory()->create(['status' => 'active']);
        $this->userIds[] = (int) $creator->id;
        $organization = app(\App\Core\Organizations\OrganizationProvisioner::class)->create($creator, 'Schema Inv Org '.uniqid());
        $this->organizationIds[] = (int) $organization->id;
        $workspace = $organization->workspaces()->where('is_default', true)->firstOrFail();
        $role = app(\App\Core\Rbac\RoleProvisioner::class)->organizationMember($organization);

        $valid = [
            'email_normalized' => 'schema@example.com',
            'token_hash' => hash('sha256', 'schema-token'),
            'status' => 'pending',
            'intended_organization_role_id' => $role->id,
            'intended_workspace_role_id' => null,
            'invited_by_user_id' => $creator->id,
            'expires_at' => '2026-06-08 00:00:00',
            'status_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        // Valid organization invitation.
        $id = DB::table('core_invitations')->insertGetId($valid + ['type' => 'organization', 'organization_id' => $organization->id, 'workspace_id' => null]);
        $this->invitationIds[] = (int) $id;

        // Organization invitation carrying a workspace violates the scope CHECK.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'organization', 'organization_id' => $organization->id, 'workspace_id' => $workspace->id,
            'token_hash' => hash('sha256', 't2'), 'email_normalized' => 'b@example.com',
        ]));
        // Workspace invitation carrying an organization violates it too.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'workspace', 'organization_id' => $organization->id, 'workspace_id' => $workspace->id,
            'token_hash' => hash('sha256', 't3'), 'email_normalized' => 'c@example.com',
        ]));
        // No scope at all violates it.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'organization', 'organization_id' => null, 'workspace_id' => null,
            'token_hash' => hash('sha256', 't4'), 'email_normalized' => 'd@example.com',
        ]));
        // Unknown status violates the status CHECK.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'organization', 'organization_id' => $organization->id, 'workspace_id' => null,
            'token_hash' => hash('sha256', 't5'), 'email_normalized' => 'e@example.com', 'status' => 'expired',
        ]));
        // Combined without both role intents violates the amended shape.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'combined', 'organization_id' => $organization->id, 'workspace_id' => $workspace->id,
            'token_hash' => hash('sha256', 't6'), 'email_normalized' => 'g@example.com',
        ]));
        // Organization intent carrying a workspace role violates it.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'organization', 'organization_id' => $organization->id, 'workspace_id' => null,
            'token_hash' => hash('sha256', 't7'), 'email_normalized' => 'h@example.com',
            'intended_workspace_role_id' => $role->id,
        ]));
        // Duplicate token hash violates uniqueness.
        $this->assertQueryFails(fn () => DB::table('core_invitations')->insert($valid + [
            'type' => 'organization', 'organization_id' => $organization->id, 'workspace_id' => null,
            'email_normalized' => 'f@example.com',
        ]));
        // Restrictive FK: the intended role cannot be deleted while referenced.
        $this->assertQueryFails(fn () => DB::table('core_roles')->where('id', $role->id)->delete());
        // Restrictive FK: the organization cannot be deleted while referenced.
        $this->assertQueryFails(fn () => DB::table('organizations')->where('id', $organization->id)->delete());
    }

    private function assertQueryFails(callable $operation): void
    {
        try {
            $operation();
            $this->fail('Expected the query to be rejected.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }
}
