<?php

namespace Tests\Feature\Core;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * CORE-REQ engine parity: the XOR recipient check must coexist with FK
 * referential actions, and parent deletion must not orphan inbox records.
 */
class CoreSharedRecipientSchemaMysqlTest extends TestCase
{
    use RefreshDatabase;

    public function test_recipient_scope_check_and_delete_restrictions_hold_on_mysql_and_mariadb(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            $this->markTestSkipped('Requires MySQL / MariaDB CHECK + FK semantics.');
        }

        $this->assertTrue(Schema::hasTable('core_action_items'));

        $parent = DB::table('users')->insertGetId([
            'name' => 'Inbox recipient',
            'username' => 'inbox_schema_' . bin2hex(random_bytes(5)),
            'email' => 'inbox_schema_' . bin2hex(random_bytes(5)) . '@example.test',
            'password' => 'placeholder',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $valid = [
            'origin_module' => 'test',
            'origin_type' => 'recipient_schema',
            'origin_id' => 1,
            'action_kind' => 'open',
            'title' => 'Schema recipient restriction',
            'urgency' => 'normal',
            'recipient_user_id' => $parent,
            'organization_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        DB::table('core_action_items')->insert($valid);
        foreach ([
            array_merge($valid, ['origin_id' => 2, 'recipient_user_id' => null, 'organization_id' => null]),
            array_merge($valid, ['origin_id' => 3, 'recipient_user_id' => $parent, 'organization_id' => 1]),
        ] as $invalid) {
            try {
                DB::table('core_action_items')->insert($invalid);
                $this->fail('Recipient XOR CHECK accepted an invalid record.');
            } catch (\Illuminate\Database\QueryException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }

        try {
            DB::table('users')->where('id', $parent)->delete();
            $this->fail('Recipient parent was deleted despite restrictive FK.');
        } catch (\Illuminate\Database\QueryException $e) {
            $this->assertNotSame('', $e->getMessage());
        }
        $this->assertDatabaseHas('core_action_items', ['recipient_user_id' => $parent]);
    }
}
