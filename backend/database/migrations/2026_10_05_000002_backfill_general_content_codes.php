<?php

use App\Support\Content\ContentCodeAllocator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Give legacy Content rows a stable organization-wide fallback code.
 *
 * New Content already receives its code through ContentCreator. This migration
 * only fills historical NULL/blank rows and deliberately does not erase issued
 * codes on rollback because codes are durable external identifiers.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('contents') || ! Schema::hasColumn('contents', 'code')) {
            return;
        }

        do {
            $filled = app(ContentCodeAllocator::class)->backfillMissing(200);
        } while ($filled === 200);
    }

    public function down(): void
    {
        // Issued content codes are stable identifiers and must never be cleared.
    }
};
