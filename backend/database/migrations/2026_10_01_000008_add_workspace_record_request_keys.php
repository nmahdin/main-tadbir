<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const UNIQUE_INDEX = 'workspace_records_request_scope_unique';

    public function up(): void
    {
        Schema::table('workspace_records', function (Blueprint $table): void {
            $table->uuid('client_request_id')->nullable()->after('owner_id');
            $table->unique(['client_request_id', 'kind', 'owner_id'], self::UNIQUE_INDEX);
        });
    }

    public function down(): void
    {
        Schema::table('workspace_records', function (Blueprint $table): void {
            $table->dropUnique(self::UNIQUE_INDEX);
            $table->dropColumn('client_request_id');
        });
    }
};
