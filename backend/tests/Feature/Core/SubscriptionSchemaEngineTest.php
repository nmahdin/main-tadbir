<?php

namespace Tests\Feature\Core;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Business-date storage contract (MariaDB legacy-mode incident).
 *
 * Runs on real MySQL-family engines only (SQLite cannot express
 * TIMESTAMP implicit defaults). Proves the subscription /
 * invitation / email-challenge business dates are explicit,
 * non-null DATETIME columns with NO server-side default — so
 * MariaDB <= 10.9 with `explicit_defaults_for_timestamp=OFF`
 * (which hands bare TIMESTAMP columns an implicit zero-date or
 * CURRENT_TIMESTAMP default) cannot reject or silently rewrite
 * them, and a row written without explicit dates fails closed
 * on every engine. Exercised by the MySQL gate, the MariaDB
 * 10.11 gate, and the MariaDB 10.4 legacy-mode gate.
 */
class SubscriptionSchemaEngineTest extends TestCase
{
    /**
     * table => business-date columns that must be explicit DATETIME.
     *
     * @var array<string, list<string>>
     */
    private const BUSINESS_DATE_COLUMNS = [
        'core_subscriptions' => ['starts_at', 'expires_at', 'grace_ends_at'],
        'core_subscription_periods' => ['effective_starts_at', 'expires_at', 'grace_ends_at'],
        'core_invitations' => ['expires_at'],
        'core_email_verification_challenges' => ['expires_at'],
    ];

    protected function setUp(): void
    {
        parent::setUp();

        if (! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            $this->markTestSkipped('MySQL-family engine test (SQLite has no TIMESTAMP implicit defaults).');
        }
    }

    public function test_business_dates_are_non_null_datetime_without_server_defaults(): void
    {
        foreach (self::BUSINESS_DATE_COLUMNS as $table => $columns) {
            foreach ($columns as $column) {
                $row = DB::table('information_schema.COLUMNS')
                    ->where('TABLE_SCHEMA', DB::connection()->getDatabaseName())
                    ->where('TABLE_NAME', $table)
                    ->where('COLUMN_NAME', $column)
                    ->first(['DATA_TYPE', 'IS_NULLABLE', 'COLUMN_DEFAULT']);
                $this->assertNotNull($row, "{$table}.{$column} must exist");
                $this->assertSame('datetime', strtolower((string) $row->DATA_TYPE), "{$table}.{$column} must be DATETIME, not TIMESTAMP");
                $this->assertSame('NO', $row->IS_NULLABLE, "{$table}.{$column} must stay NOT NULL");
                $this->assertNull($row->COLUMN_DEFAULT, "{$table}.{$column} must not carry a server default");
            }
        }
    }

    public function test_insert_without_explicit_business_date_fails_closed(): void
    {
        $user = \App\Models\User::factory()->create();

        try {
            DB::table('core_email_verification_challenges')->insert([
                'user_id' => $user->id,
                'email_normalized' => 'legacy-mode@example.test',
                'token_hash' => str_repeat('a', 64),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('A challenge without an explicit expires_at must be rejected (no implicit default may rescue it).');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        } finally {
            DB::table('core_email_verification_challenges')->where('email_normalized', 'legacy-mode@example.test')->delete();
            DB::table('users')->where('id', $user->id)->delete();
        }
    }
}
