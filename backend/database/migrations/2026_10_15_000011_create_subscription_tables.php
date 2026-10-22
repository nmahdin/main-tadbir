<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage C5-2 — subscription ownership, current state, and the
 * immutable period history.
 *
 * Exactly one CURRENT subscription may exist per owner (an
 * organization, or a personal workspace). MySQL unique indexes
 * treat NULLs as distinct, so a nullable composite unique would
 * NOT enforce this; like platform_role_assignments before it, the
 * guarantee is a generated `owner_key` column ('org:{id}' or
 * 'ws:{id}') under a unique index — a database-backed invariant,
 * with the owner row lock in SubscriptionService serializing
 * writers before it. Owner XOR (exactly one owner column set) is
 * a MySQL CHECK plus a service/model guard for SQLite parity.
 *
 * History is preserved: every foreign key RESTRICTs deletion, and
 * core_subscription_periods rows are immutable domain records
 * (guarded in the model) that later entitlement evaluation and
 * audits read without ever altering the past.
 *
 * Compatibility correction (fresh installs): the business dates
 * are DATETIME, not TIMESTAMP. MariaDB <= 10.9 with the legacy
 * `explicit_defaults_for_timestamp=OFF` gives a second bare
 * TIMESTAMP column an implicit zero-date default, which strict
 * NO_ZERO_DATE rejects (1067) — and would silently attach
 * DEFAULT/ON UPDATE CURRENT_TIMESTAMP to the first one. The
 * application always populates these fields explicitly as UTC
 * (SubscriptionService) and the models cast them `datetime`, so
 * DATETIME is type-compatible. Databases where this migration
 * already ran keep TIMESTAMP columns; both types store the same
 * UTC instants the services write and compare, and nothing here
 * rewrites an applied schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            $table->foreignId('personal_workspace_id')->nullable()->constrained('workspaces')->restrictOnDelete();
            $table->foreignId('plan_version_id')->constrained('core_plan_versions')->restrictOnDelete();
            $table->dateTime('starts_at');
            $table->dateTime('expires_at');
            $table->dateTime('grace_ends_at');
            $table->unsignedInteger('status_version')->default(1);
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_subscriptions ADD COLUMN owner_key VARCHAR(40) GENERATED ALWAYS AS (CASE WHEN organization_id IS NOT NULL THEN CONCAT('org:', organization_id) ELSE CONCAT('ws:', personal_workspace_id) END) STORED");
            DB::statement('CREATE UNIQUE INDEX core_subscriptions_owner_key_unique ON core_subscriptions (owner_key)');
            DB::statement('ALTER TABLE core_subscriptions ADD CONSTRAINT core_subscriptions_owner_xor_check CHECK ((organization_id IS NULL) <> (personal_workspace_id IS NULL))');
        } elseif ($driver === 'sqlite') {
            DB::statement("ALTER TABLE core_subscriptions ADD COLUMN owner_key TEXT GENERATED ALWAYS AS (CASE WHEN organization_id IS NOT NULL THEN 'org:' || organization_id ELSE 'ws:' || personal_workspace_id END) STORED");
            DB::statement('CREATE UNIQUE INDEX core_subscriptions_owner_key_unique ON core_subscriptions (owner_key)');
        }

        Schema::create('core_subscription_periods', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('subscription_id')->constrained('core_subscriptions')->restrictOnDelete();
            $table->foreignId('plan_version_id')->constrained('core_plan_versions')->restrictOnDelete();
            $table->string('operation', 20);
            $table->dateTime('effective_starts_at');
            $table->dateTime('expires_at');
            $table->dateTime('grace_ends_at');
            $table->string('reason', 500);
            $table->string('correlation_id', 80);
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['subscription_id', 'correlation_id']);
        });

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE core_subscription_periods ADD CONSTRAINT core_subscription_periods_operation_check CHECK (operation IN ('initial', 'renewal'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('core_subscription_periods');
        Schema::dropIfExists('core_subscriptions');
    }
};
