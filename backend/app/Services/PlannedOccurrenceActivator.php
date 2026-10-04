<?php

namespace App\Services;

use App\Models\Content;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/** Optional scheduler-ready service; normal Series operation never depends on it. */
final class PlannedOccurrenceActivator
{
    public function activateDue(?CarbonInterface $through = null, int $limit = 100): int
    {
        $through ??= now();
        $ids = Content::whereNotNull('series_id')
            ->whereNotNull('payload->_seriesPlanning->activateAt')
            ->whereNull('payload->_seriesPlanning->activatedAt')
            ->where('payload->_seriesPlanning->activateAt', '<=', $through->toDateString())
            ->orderBy('id')->limit(max(1, min($limit, 500)))->pluck('id');
        $activated = 0;
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $through, &$activated): void {
                $content = Content::whereKey($id)->lockForUpdate()->first();
                if (! $content || ! empty($content->payload['_seriesPlanning']['activatedAt'])) return;
                app(ContentStageTaskSync::class)->sync($content);
                $payload = $content->refresh()->payload ?? [];
                $payload['_seriesPlanning']['activatedAt'] = $through->toIso8601String();
                $content->update(['payload' => $payload]);
                $activated++;
            }, 3);
        }
        return $activated;
    }
}
