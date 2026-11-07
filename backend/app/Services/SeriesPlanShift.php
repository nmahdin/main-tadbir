<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * جابه‌جایی هم‌زمانِ دوره‌های بعدیِ یک مجموعه.
 *
 * وقتی انتشارِ یک دورهٔ مجموعه (حذف‌شده یا منتشرنشده) به هفتهٔ بعد منتقل
 * می‌شود، دورهٔ بعدی نباید روی همان روز بیفتد. پیش‌تر تنها راه این بود که کاربر
 * تاریخِ همهٔ دوره‌های بعدی را یکی‌یکی دستی عوض کند؛ حالا همان جابه‌جایی به
 * دوره‌های بعدیِ **برنامه‌ریزی‌شدهٔ فعال‌نشده** منتقل می‌شود.
 *
 * حدودِ ایمنی:
 *  - فقط دوره‌های بعدیِ همان مجموعه (شمارهٔ بزرگ‌تر) جابه‌جا می‌شوند؛
 *  - دورهٔ منتشرشده یا فعال‌شده (تسک‌هایش ساخته شده) دست‌نخورده می‌ماند تا
 *    کارِ در جریانِ کسی بی‌خبر عوض نشود؛
 *  - هیچ نوع یا وضعیت تازه‌ای ساخته نمی‌شود؛ فقط تاریخ‌های همان پرونده‌ها و
 *    مراحل و مهلتشان به همان اندازه جلو/عقب می‌رود؛
 *  - هر جابه‌جایی در تاریخچهٔ فعالیت ثبت می‌شود.
 */
final class SeriesPlanShift
{
    /** @return array{shifted:int, days:int} */
    public function after(User $actor, Content $source, string $oldDate, string $newDate): array
    {
        $days = $this->days($oldDate, $newDate);
        if (! $source->series_id || $days === 0) {
            return ['shifted' => 0, 'days' => 0];
        }

        return DB::transaction(function () use ($actor, $source, $days): array {
            $targets = Content::query()
                ->where('series_id', $source->series_id)
                ->whereKeyNot($source->id)
                ->whereNotNull('series_sequence')
                ->where('series_sequence', '>', $source->series_sequence)
                ->whereNull('series_activated_at')
                ->orderBy('series_sequence')
                ->lockForUpdate()
                ->get()
                ->reject(fn (Content $content) => ContentPublication::published($content));
            $shifted = 0;
            foreach ($targets as $content) {
                $payload = is_array($content->payload) ? $content->payload : [];
                $payload['publishInfo'] = is_array($payload['publishInfo'] ?? null) ? $payload['publishInfo'] : [];
                $payload['publishInfo']['date'] = $this->shiftDate($payload['publishInfo']['date'] ?? null, $days);
                if (array_key_exists('startDate', $payload)) {
                    $payload['startDate'] = $this->shiftDate($payload['startDate'], $days);
                }
                if (array_key_exists('deadline', $payload)) {
                    $payload['deadline'] = $this->shiftDate($payload['deadline'], $days);
                }
                $payload['stages'] = collect(is_array($payload['stages'] ?? null) ? $payload['stages'] : [])
                    ->map(function ($stage) use ($days) {
                        if (! is_array($stage)) {
                            return $stage;
                        }
                        foreach (['startDate', 'deadline'] as $field) {
                            if (array_key_exists($field, $stage)) {
                                $stage[$field] = $this->shiftDate($stage[$field], $days);
                            }
                        }

                        return $stage;
                    })->all();
                $planning = is_array($payload['_seriesPlanning'] ?? null) ? $payload['_seriesPlanning'] : [];
                if (! empty($planning['activateAt']) && empty($planning['activatedAt']) && is_string($planning['activateAt'])) {
                    $planning['activateAt'] = CarbonImmutable::parse($planning['activateAt'])->addDays($days)->toIso8601String();
                    $payload['_seriesPlanning'] = $planning;
                }
                $content->update([
                    'payload' => $payload,
                    'deadline' => $content->deadline?->copy()->addDays($days)->toDateString(),
                    'planned_start_at' => $content->planned_start_at?->copy()->addDays($days),
                ]);
                $shifted++;
            }
            if ($shifted > 0) {
                ActivityLog::create([
                    'user_id' => $actor->id, 'project_id' => $source->project_id, 'type' => 'series_plan_shifted',
                    'action' => 'جابه‌جایی دوره‌های بعدی مجموعه', 'details' => 'series:'.$source->series_id,
                    'metadata' => ['recordType' => 'content', 'recordId' => (string) $source->id,
                        'days' => $days, 'shifted' => $shifted],
                ]);
            }

            return ['shifted' => $shifted, 'days' => $days];
        }, 3);
    }

    /** تعداد روزِ جابه‌جایی؛ مقدارهای نامعتبر صفر می‌شوند. */
    private function days(string $oldDate, string $newDate): int
    {
        foreach ([$oldDate, $newDate] as $value) {
            if (preg_match('/^\d{4}-\d{2}-\d{2}/', trim($value)) !== 1) {
                return 0;
            }
        }

        return (int) round(
            CarbonImmutable::parse(substr(trim($oldDate), 0, 10))->startOfDay()
                ->diffInDays(CarbonImmutable::parse(substr(trim($newDate), 0, 10))->startOfDay(), false)
        );
    }

    private function shiftDate(mixed $value, int $days): mixed
    {
        if (! is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}/', trim($value)) !== 1) {
            return $value;
        }

        return CarbonImmutable::parse(substr(trim($value), 0, 10))->addDays($days)->toDateString();
    }
}
