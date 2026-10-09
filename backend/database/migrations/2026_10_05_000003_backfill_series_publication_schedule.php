<?php

use App\Models\Content;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Fill missing publication date/time on historical Series occurrences.
 * Existing operator-entered publication values are never overwritten.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('contents') || ! Schema::hasColumn('contents', 'series_id')) {
            return;
        }

        Content::query()->whereNotNull('series_id')->with(['series', 'seriesRevision'])
            ->orderBy('id')->chunkById(100, function ($contents): void {
                foreach ($contents as $content) {
                    $payload = $content->payload ?? [];
                    $publication = is_array($payload['publishInfo'] ?? null) ? $payload['publishInfo'] : [];
                    $changed = false;
                    if (empty($publication['date']) && $content->planned_start_at) {
                        $publication['date'] = $content->planned_start_at->toDateString();
                        $changed = true;
                    }
                    if (empty($publication['time'])) {
                        $revision = $content->seriesRevision;
                        $series = $content->series;
                        $configured = (string) (($revision?->default_publication_config ?? $series?->default_publication_config ?? [])['time'] ?? '');
                        $activation = (string) (($revision?->recurrence_config ?? $series?->recurrence_config ?? [])['activationTime'] ?? '');
                        $publication['time'] = $this->validTime($configured)
                            ? $configured
                            : ($this->validTime($activation) ? $activation : ($content->planned_start_at?->format('H:i') ?? '00:00'));
                        $changed = true;
                    }
                    if ($changed) {
                        $payload['publishInfo'] = $publication;
                        $content->updateQuietly(['payload' => $payload]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Publication schedules may have become operational; never erase them.
    }

    private function validTime(string $value): bool
    {
        return preg_match('/^(?:[01]\\d|2[0-3]):[0-5]\\d$/', $value) === 1;
    }
};
