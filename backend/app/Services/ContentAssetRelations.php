<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DamAsset;
use App\Models\User;
use App\Support\Dam\DamRelationRole;
use Illuminate\Validation\ValidationException;

/** Bind workflow outputs to existing DAM assets/versions; no second output store. */
final class ContentAssetRelations
{
    /** @param array<int, mixed> $stages */
    public function normalize(User $actor, ?Content $content, array $stages): array
    {
        // نوبت ۱۷: با ثبت اولین خروجی، وضعیت مرحله از in_progress به ready_for_review می‌رود (فرانت هم همین را می‌کند؛ بک‌اند هم تضمین می‌کند).
        $isDelivered = function (array $output): bool {
            return ! empty($output['isDelivered']) || ! empty($output['value']) || ! empty($output['url']) || ! empty($output['assetId']) || ! empty($output['fileName']);
        };
        $oldById = $content ? collect($content->payload['stages'] ?? [])->filter(fn ($s) => is_array($s) && ! empty($s['id']))->keyBy('id') : collect([]);

        foreach ($stages as $stageIndex => $stage) {
            if (! is_array($stage)) {
                continue;
            }
            foreach (($stage['outputs'] ?? []) as $outputIndex => $output) {
                if (! is_array($output) || empty($output['assetId'])) {
                    continue;
                }
                $asset = DamAsset::query()->find($output['assetId']);
                $legacyStage = $content ? collect($content->payload['stages'] ?? [])->first(
                    fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === (string) ($stage['id'] ?? ''),
                ) : null;
                $legacyOutput = is_array($legacyStage) ? collect($legacyStage['outputs'] ?? [])->first(
                    fn ($candidate) => is_array($candidate)
                        && (string) ($candidate['id'] ?? '') === (string) ($output['id'] ?? '')
                        && (string) ($candidate['assetId'] ?? '') === (string) ($output['assetId'] ?? ''),
                ) : null;
                // خروجی‌ای که همین حالا هم به همین دارایی وصل بوده، مرجع تاریخی
                // است: اگر دارایی بعداً از مخزن حذف شده باشد، نباید هر ذخیرهٔ
                // بعدیِ همان محتوا (ویرایش جریان، ثبت خروجی تازه، تغییر مهلت) را
                // با خطای «دارایی در دسترس نیست» ببندد. فراداده دست‌نخورده می‌ماند.
                if (! $asset && is_array($legacyOutput)) {
                    continue;
                }
                $alreadyLinked = $asset && $content && $asset->relations()
                    ->where('related_type', 'content')->where('related_id', $content->id)->exists();
                if (! $asset || (! is_array($legacyOutput) && ! $alreadyLinked && ! app(DamAssetAccess::class)->canView($actor, $asset))) {
                    throw ValidationException::withMessages(['stages' => 'دارایی خروجی انتخابی در دسترس نیست.']);
                }
                $version = ! empty($output['assetVersionId'])
                    ? $asset->versions()->whereKey($output['assetVersionId'])->first()
                    : $asset->versions()->orderByDesc('version_number')->first();
                if (! $version) {
                    if (is_array($legacyOutput)) {
                        // Old metadata-only links may predate DamVersion. Preserve
                        // them until a real revision is uploaded; never invent a version.
                        continue;
                    }
                    throw ValidationException::withMessages(['stages' => 'نسخه دارایی خروجی معتبر نیست.']);
                }
                $stages[$stageIndex]['outputs'][$outputIndex]['assetId'] = (string) $asset->id;
                $stages[$stageIndex]['outputs'][$outputIndex]['assetVersionId'] = (string) $version->id;
                $stages[$stageIndex]['outputs'][$outputIndex]['assetVersionNumber'] = (int) $version->version_number;
            }

            // اگر این مرحله قبلاً خروجی نداشته و حالا حداقل یک خروجی تحویل‌شده دارد و در حال انجام است، به آمادهٔ بررسی برود.
            if (is_array($stage) && ! empty($stage['id'])) {
                $oldStage = $oldById->get((string) $stage['id']);
                if (is_array($oldStage)) {
                    $oldDelivered = collect($oldStage['outputs'] ?? [])->filter(fn ($o) => is_array($o) && $isDelivered($o))->count();
                    $newDelivered = collect($stages[$stageIndex]['outputs'] ?? [])->filter(fn ($o) => is_array($o) && $isDelivered($o))->count();
                    $oldStatus = (string) ($oldStage['status'] ?? '');
                    $newStatus = (string) ($stages[$stageIndex]['status'] ?? $oldStatus);
                    if ($oldDelivered === 0 && $newDelivered > 0 && $oldStatus === 'in_progress' && $newStatus === 'in_progress') {
                        $stages[$stageIndex]['status'] = 'ready_for_review';
                    }
                }
            }
        }

        return $stages;
    }

    public function sync(User $actor, Content $content): void
    {
        foreach (($content->payload['stages'] ?? []) as $stage) {
            if (! is_array($stage) || empty($stage['id'])) {
                continue;
            }
            foreach (($stage['outputs'] ?? []) as $output) {
                if (! is_array($output) || empty($output['id']) || empty($output['assetId'])) {
                    continue;
                }
                $asset = DamAsset::query()->find($output['assetId']);
                if (! $asset) {
                    continue;
                }
                $context = [
                    'relation_role' => DamRelationRole::STAGE_OUTPUT,
                    'stage_id' => (string) $stage['id'],
                    'output_id' => (string) $output['id'],
                    'asset_version_id' => ! empty($output['assetVersionId']) ? (int) $output['assetVersionId'] : null,
                ];
                $exactKey = DamRelationRole::contextKey((string) $stage['id'], (string) $output['id'], null);
                $exact = $asset->relations()
                    ->where('related_type', 'content')->where('related_id', $content->id)
                    ->where('relation_type', DamRelationRole::STAGE_OUTPUT)
                    ->where('context_key', $exactKey)->first();
                if ($exact) {
                    continue;
                }
                // Upgrade the stage-only relation produced during upload rather
                // than leaving a second, vague row next to the exact output link.
                $broad = $asset->relations()
                    ->where('related_type', 'content')->where('related_id', $content->id)
                    ->where('relation_type', DamRelationRole::STAGE_OUTPUT)
                    ->where('stage_id', (string) $stage['id'])->whereNull('output_id')->first();
                if ($broad) {
                    $broad->update([
                        'output_id' => (string) $output['id'],
                        'asset_version_id' => $context['asset_version_id'],
                        'context_key' => DamRelationRole::contextKey((string) $stage['id'], (string) $output['id'], null),
                    ]);
                } else {
                    app(DamService::class)->relate($asset, 'content', (int) $content->id, $actor, $context);
                }
            }
        }
    }
}
