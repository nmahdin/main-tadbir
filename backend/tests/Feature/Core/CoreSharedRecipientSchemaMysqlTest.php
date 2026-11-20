<?php

namespace Tests\Feature\Core;

use App\Core\Organizations\Organization;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * CORE-REQ engine parity: recipient XOR plus unique per-owner origin keys
 * coexist with restrictive foreign keys on MySQL and MariaDB engines.
 */
class CoreSharedRecipientSchemaMysqlTest extends TestCase
{
    use RefreshDatabase;

    public function test_recipient_scope_and_origin_uniqueness_and_delete_restrictions(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            $this->markTestSkipped('Requires MySQL/MariaDB native CHECK and FK semantics.');
        }

        $this->assertTrue(Schema::hasTable('core_action_items'));
        $user = User::factory()->create(['status' => 'active']);
        $org = Organization::factory()->create();

        $base = [
            'origin_module' => 'test',
            'origin_type' => 'recipient_schema',
            'origin_id' => 1,
            'action_kind' => 'open',
            'title' => 'Recipient constraint',
            'urgency' => 'normal',
            'recipient_user_id' => $user->id,
            'organization_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        DB::table('core_action_items')->insert($base);
        $this->assertRejected($base, 'A duplicate personal recipient should be rejected.');
        $this->assertRejected(array_merge($base, [
            'origin_id' => 2, 'recipient_user_id' => null, 'organization_id' => null,
        ]), 'Neither recipient is allowed.');
        $this->assertRejected(array_merge($base, [
            'origin_id' => 3, 'organization_id' => $org->id,
        ]), 'Both recipients cannot be populated.');

        $organizationItem = array_merge($base, [
            'recipient_user_id' => null, 'organization_id' => $org->id,
        ]);
        DB::table('core_action_items')->insert($organizationItem);
        $this->assertRejected($organizationItem, 'A duplicate organization recipient should be rejected.');

        $this->assertRejectedDeletion('users', $user->id);
        $this->assertRejectedDeletion('organizations', $org->id);
        $this->assertDatabaseCount('core_action_items', 2);
    }

    private function assertRejected(array $row, string $message): void
    {
        try {
            DB::table('core_action_items')->insert($row);
            $this->fail($message);
        } catch (QueryException $e) {
            $this->assertNotEmpty($e->getMessage());
        }
    }

    private function assertRejectedDeletion(string $table, int $id): void
    {
        try {
            DB::table($table)->where('id', $id)->delete();
            $this->fail('Parent deletion must be restricted for active inbox recipients.');
        } catch (QueryException $e) {
            $this->assertNotEmpty($e->getMessage());
        }
    }
}
