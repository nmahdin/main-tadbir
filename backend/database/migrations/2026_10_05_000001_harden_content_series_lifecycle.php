<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Version Series configuration and expose planned occurrence lifecycle fields.
 *
 * The existing JSON planning marker is intentionally retained for backward
 * compatibility; indexed columns become the authoritative query path while old
 * deployments and payload readers continue to work during a rolling upgrade.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_series_revisions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('series_id')->constrained('content_series')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->unsignedInteger('effective_from_sequence')->default(1);
            $table->string('content_type', 80);
            $table->string('process_template_id', 120)->nullable();
            $table->string('recurrence_type', 30);
            $table->json('recurrence_config')->nullable();
            $table->json('default_content_payload')->nullable();
            $table->json('default_publication_config')->nullable();
            $table->string('change_reason', 500)->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['series_id', 'version'], 'series_revisions_series_version_unique');
            $table->index(['series_id', 'effective_from_sequence'], 'series_revisions_effective_index');
        });

        Schema::table('content_series', function (Blueprint $table): void {
            $table->unsignedInteger('lock_version')->default(1)->after('next_sequence_number');
            // Deliberately no FK: avoiding a circular delete dependency between
            // the parent Series row and its cascading revision children.
            $table->unsignedBigInteger('current_revision_id')->nullable()->after('lock_version');
            $table->index('current_revision_id', 'content_series_current_revision_index');
        });

        Schema::table('contents', function (Blueprint $table): void {
            $table->foreignId('series_revision_id')->nullable()->after('series_id')
                ->constrained('content_series_revisions')->nullOnDelete();
            $table->timestamp('planned_start_at')->nullable()->after('period_key');
            $table->timestamp('series_activated_at')->nullable()->after('planned_start_at');
            $table->index(
                ['series_id', 'planned_start_at', 'series_activated_at'],
                'contents_series_activation_index',
            );
        });

        $decode = static function (mixed $value): array {
            if (is_array($value)) {
                return $value;
            }
            $decoded = json_decode((string) ($value ?? ''), true);

            return is_array($decoded) ? $decoded : [];
        };

        DB::table('content_series')->orderBy('id')->chunkById(100, function ($rows) use ($decode): void {
            foreach ($rows as $series) {
                $revisionId = DB::table('content_series_revisions')->insertGetId([
                    'series_id' => $series->id,
                    'version' => 1,
                    'effective_from_sequence' => 1,
                    'content_type' => $series->content_type,
                    'process_template_id' => $series->process_template_id,
                    'recurrence_type' => $series->recurrence_type,
                    'recurrence_config' => json_encode($decode($series->recurrence_config), JSON_UNESCAPED_UNICODE),
                    'default_content_payload' => json_encode($decode($series->default_content_payload), JSON_UNESCAPED_UNICODE),
                    'default_publication_config' => json_encode($decode($series->default_publication_config), JSON_UNESCAPED_UNICODE),
                    'change_reason' => 'نسخه اولیه مهاجرت‌یافته',
                    'changed_by' => $series->created_by,
                    'created_at' => $series->created_at ?? now(),
                    'updated_at' => $series->updated_at ?? now(),
                ]);
                DB::table('content_series')->where('id', $series->id)->update([
                    'current_revision_id' => $revisionId,
                    'lock_version' => 1,
                ]);
                DB::table('contents')->where('series_id', $series->id)->update([
                    'series_revision_id' => $revisionId,
                ]);
            }
        });

        DB::table('contents')->whereNotNull('series_id')->orderBy('id')->chunkById(100, function ($rows) use ($decode): void {
            foreach ($rows as $content) {
                $payload = $decode($content->payload);
                $planning = is_array($payload['_seriesPlanning'] ?? null) ? $payload['_seriesPlanning'] : [];
                DB::table('contents')->where('id', $content->id)->update([
                    'planned_start_at' => $planning['activateAt'] ?? null,
                    'series_activated_at' => $planning['activatedAt'] ?? null,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('contents', function (Blueprint $table): void {
            $table->dropIndex('contents_series_activation_index');
            $table->dropConstrainedForeignId('series_revision_id');
            $table->dropColumn(['planned_start_at', 'series_activated_at']);
        });
        Schema::table('content_series', function (Blueprint $table): void {
            $table->dropIndex('content_series_current_revision_index');
            $table->dropColumn(['lock_version', 'current_revision_id']);
        });
        Schema::dropIfExists('content_series_revisions');
    }
};
