<?php

namespace App\Services;

use App\Models\Content;
use App\Models\ContentSeries;
use App\Models\DamAsset;
use App\Models\DamRelation;
use App\Models\Project;
use App\Models\ProjectContentPlan;
use App\Models\SystemSetting;
use App\Models\Task;

/** Bounded, read-only operational consistency checks. No repair behavior. */
final class IntegrityDiagnostics
{
    /** @return list<array<string,mixed>> */
    public function findings(): array
    {
        $findings = [];
        $add = function (string $severity, string $code, string $message, string $type, mixed $id, string $link) use (&$findings): void {
            if (count($findings) >= 500) return;
            $findings[] = compact('severity', 'code', 'message', 'type', 'id', 'link');
        };

        Content::orderBy('id')->chunkById(200, function ($contents) use ($add): void {
            foreach ($contents as $content) {
                if (! $content->owner_id) {
                    $add('critical', 'content_owner_missing', 'محتوا مسئول اصلی ندارد.', 'content', (string) $content->id, '/contents/'.$content->id);
                }
                if (! $content->code) {
                    $add('warning', 'content_code_missing', 'کد پایدار محتوا تخصیص نیافته است.', 'content', (string) $content->id, '/contents/'.$content->id);
                }
                foreach (collect($content->payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage)) as $stage) {
                    if (empty($stage['assigneeId'])) {
                        $add('warning', 'stage_assignee_missing', 'یک مرحله مسئول اجرا ندارد.', 'content', (string) $content->id, '/contents/'.$content->id);
                        break;
                    }
                }
                foreach (collect($content->payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage)) as $stage) {
                    if (($stage['reviewRequired'] ?? true) !== false
                        && empty($stage['reviewerId']) && empty($stage['approverId']) && empty($content->payload['approverId'])) {
                        $add('warning', 'reviewer_missing', 'مرحله نیازمند بررسی، ارزیاب معتبر ندارد.', 'content', (string) $content->id, '/contents/'.$content->id);
                        break;
                    }
                }
                if (in_array($content->status, ['approved', 'ready_to_publish'], true) && empty($content->payload['publisherId'])) {
                    $add('warning', 'publisher_missing', 'محتوای آماده انتشار، ناشر تعیین‌شده ندارد.', 'content', (string) $content->id, '/contents/'.$content->id);
                }
                foreach (collect($content->payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage)) as $stage) {
                    foreach (collect($stage['outputs'] ?? [])->filter(fn ($output) => is_array($output) && ! empty($output['assetId'])) as $output) {
                        if (! DamAsset::whereKey($output['assetId'])->exists()) {
                            $add('critical', 'stage_output_asset_missing', 'خروجی مرحله به دارایی DAM ناموجود اشاره می‌کند.', 'content', (string) $content->id, '/contents/'.$content->id);
                        }
                    }
                }
            }
        });

        Content::whereNotNull('series_id')->with('series:id,project_id')->orderBy('id')->chunkById(200, function ($contents) use ($add): void {
            foreach ($contents as $content) {
                if (! $content->series) {
                    $add('critical', 'series_parent_missing', 'رخداد محتوا به مجموعه ناموجود اشاره می‌کند.', 'content', (string) $content->id, '/contents/'.$content->id);
                    continue;
                }
                if ((string) ($content->project_id ?? '') !== (string) ($content->series->project_id ?? '')) {
                    $add('warning', 'series_project_mismatch', 'پروژه رخداد با پروژه مجموعه همسان نیست.', 'content', (string) $content->id, '/contents/'.$content->id);
                }
                if (! $content->period_key || ! $content->series_sequence) {
                    $add('warning', 'series_period_incomplete', 'کلید دوره یا شماره توالی رخداد کامل نیست.', 'content', (string) $content->id, '/contents/'.$content->id);
                }
            }
        });

        Content::selectRaw('series_id, period_key, COUNT(*) as aggregate')->whereNotNull('series_id')->whereNotNull('period_key')
            ->groupBy('series_id', 'period_key')->havingRaw('COUNT(*) > 1')->get()->each(function ($duplicate) use ($add): void {
                $add('critical', 'duplicate_series_period', 'بیش از یک محتوا برای یک دوره مجموعه ثبت شده است.', 'series', (string) $duplicate->series_id, '/contents/series');
            });

        Content::whereNotIn('status', ['archived', 'cancelled'])->orderBy('id')->chunkById(100, function ($contents) use ($add): void {
            foreach ($contents as $content) {
                if (! empty($content->payload['_seriesPlanning']['activateAt']) && empty($content->payload['_seriesPlanning']['activatedAt'])) continue;
                foreach (collect($content->payload['stages'] ?? [])->filter(fn ($stage) => is_array($stage)) as $stage) {
                    $stageId = (string) ($stage['id'] ?? '');
                    if ($stageId !== '' && ! Task::where('content_id', $content->id)->where('content_stage_id', $stageId)->where('kind', 'content_work')->exists()) {
                        $add('warning', 'stage_task_missing', 'برای یک مرحله فعال، تسک اجرای snapshot یافت نشد.', 'content', (string) $content->id, '/contents/'.$content->id);
                        break;
                    }
                }
            }
        });

        $configuredTypes = collect(SystemSetting::where('key', 'content_types')->first()?->value ?? [])
            ->filter(fn ($row) => is_array($row))->pluck('id')->filter()->map(fn ($id) => (string) $id);
        ProjectContentPlan::with(['project:id', 'defaultSeries:id,project_id'])->each(function ($plan) use ($add, $configuredTypes): void {
            if ($plan->default_series_id && (! $plan->project || ! $plan->defaultSeries || (int) $plan->project_id !== (int) $plan->defaultSeries->project_id)) {
                $add('warning', 'plan_series_scope_mismatch', 'مجموعه پیش‌فرض ردیف برنامه متعلق به همین پروژه نیست.', 'project', (string) $plan->project_id, '/projects/'.$plan->project_id);
            }
            if (! $plan->content_type || ($configuredTypes->isNotEmpty() && ! $configuredTypes->contains((string) $plan->content_type))) {
                $add('warning', 'plan_content_type_invalid', 'نوع محتوای ردیف برنامه در تنظیمات فعلی معتبر نیست.', 'project', (string) $plan->project_id, '/projects/'.$plan->project_id.'?tab=plan');
            }
        });

        DamRelation::whereIn('related_type', ['project', 'content', 'task'])->orderBy('id')->chunkById(200, function ($relations) use ($add): void {
            $models = ['project' => Project::class, 'content' => Content::class, 'task' => Task::class];
            foreach ($relations as $relation) {
                $class = $models[$relation->related_type];
                if (! $class::whereKey($relation->related_id)->exists()) {
                    $add('warning', 'dam_relation_orphan', 'یک رابطه DAM به رکورد ناموجود اشاره می‌کند.', 'asset', (string) $relation->asset_id, '/dam?asset='.$relation->asset_id);
                }
            }
        });

        Task::whereNull('assignee_id')->whereNotIn('status', ['completed', 'archived'])
            ->whereDate('deadline', '<', today())->each(function ($task) use ($add): void {
                $add('critical', 'overdue_task_unassigned', 'تسک عقب‌افتاده مسئول ندارد.', 'task', (string) $task->id, '/tasks/'.$task->id);
            });

        DamAsset::whereDoesntHave('relations')->each(function ($asset) use ($add): void {
            $add('info', 'asset_without_relation', 'دارایی DAM هیچ رابطه عملیاتی ندارد.', 'asset', (string) $asset->id, '/dam?asset='.$asset->id);
        });

        ContentSeries::where('status', 'active')->whereNull('process_template_id')->each(function ($series) use ($add): void {
            $add('warning', 'active_series_without_template', 'مجموعه فعال، قالب فرایند snapshot پیش‌فرض ندارد.', 'series', (string) $series->id, '/contents/series?series='.$series->id);
        });

        ContentSeries::where('status', 'archived')->whereHas('contents', fn ($q) => $q->whereNotIn('status', ['archived', 'published']))
            ->withCount(['contents as active_occurrences' => fn ($q) => $q->whereNotIn('status', ['archived', 'published'])])->each(function ($series) use ($add): void {
                $add('info', 'archived_series_active_occurrences', 'مجموعه بایگانی است اما رخدادهای مستقل فعال آن عمداً حفظ شده‌اند.', 'series', (string) $series->id, '/contents/series');
            });

        return $findings;
    }
}
