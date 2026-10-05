<?php

namespace App\Services;

use App\Models\Content;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Idempotent request-driven activation for planned Series occurrences.
 *
 * Normal operation calls this bounded service from ordinary authenticated list
 * requests. The optional CLI command invokes the same path for installations
 * that later choose to add an external scheduler.
 */
final class PlannedOccurrenceActivator
{
    public function activateDue(?CarbonInterface $through = null, int $limit = 100): int
    {
        $through ??= now();
        $ids = Content::query()->whereNotNull('series_id')
            ->whereNotNull('planned_start_at')
            ->whereNull('series_activated_at')
            ->where('planned_start_at', '<=', $through)
            ->orderBy('planned_start_at')->orderBy('id')
            ->limit(max(1, min($limit, 500)))->pluck('id');
        $activated = 0;
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $through, &$activated): void {
                $content = Content::whereKey($id)->lockForUpdate()->first();
                if (! $content || $content->series_activated_at) {
                    return;
                }
                app(ContentStageTaskSync::class)->sync($content);
                $content->refresh();
                $payload = $content->payload ?? [];
                $planning = is_array($payload['_seriesPlanning'] ?? null) ? $payload['_seriesPlanning'] : [];
                $payload['_seriesPlanning'] = [
                    ...$planning,
                    'activateAt' => $planning['activateAt'] ?? $content->planned_start_at?->toDateString(),
                    'activatedAt' => $through->toIso8601String(),
                ];
                $content->update([
                    'payload' => $payload,
                    'series_activated_at' => $through,
                ]);
                $activated++;
            }, 3);
        }

        return $activated;
    }
}
