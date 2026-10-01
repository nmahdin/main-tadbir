<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('departments', 'legacy_team_id')) {
            Schema::table('departments', function (Blueprint $table): void {
                $table->unsignedBigInteger('legacy_team_id')->nullable()->unique();
            });
        }
        if (! Schema::hasTable('department_user')) {
            Schema::create('department_user', function (Blueprint $table): void {
                $table->foreignId('department_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('role', 100)->default('member');
                $table->timestamp('joined_at')->nullable();
                $table->primary(['department_id', 'user_id']);
            });
        }
        if (! Schema::hasTable('dam_data_table_department')) {
            Schema::create('dam_data_table_department', function (Blueprint $table): void {
                $table->foreignId('dam_data_table_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->constrained()->cascadeOnDelete();
                $table->primary(['dam_data_table_id', 'department_id']);
            });
        }
        // A genuinely empty installation is already department-only. Every upgrade
        // containing domain/configuration data must explicitly complete conversion,
        // including databases whose teams were deleted but stale JSON refs remain.
        $hasData = DB::table('teams')->exists()
            || DB::table('permissions')->where('key', 'like', 'teams.%')->exists()
            || DB::table('contents')->exists() || DB::table('workspace_records')->exists()
            || DB::table('domain_records')->exists() || DB::table('system_settings')->exists();
        DB::table('system_settings')->insertOrIgnore([
            'key' => 'department_consolidation_private',
            'value' => json_encode(['phase' => $hasData ? 'teams' : 'done', 'after' => 0]),
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // Data conversion is intentionally not reversed: restore a verified backup
        // and matching application release instead of dropping memberships/grants.
        throw new RuntimeException('Department consolidation is non-destructive and forward-only. Restore a verified backup for rollback.');
    }
};
