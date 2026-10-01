<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** A command for the existing content-stage review, not a new workflow engine. */
final class ContentReview
{
    public const STATUSES = ['pending_dependency', 'ready', 'not_started', 'in_progress', 'ready_for_review', 'pending_approval', 'needs_revision', 'revisions_needed', 'approved', 'completed', 'skipped'];

    public const WAITING = ['pending_approval', 'ready_for_review'];

    public static function version(Content $content): string
    {
        return hash('sha256', json_encode([$content->status, $content->owner_id, $content->payload['approverId'] ?? null, $content->payload['stages'] ?? []]));
    }

    private function reviewerId(Content $content, array $stage): int|string|null
    {
        if (($stage['reviewRequired'] ?? true) === false) {
            return null;
        }

        return $stage['reviewerId'] ?? $stage['approverId'] ?? $content->payload['approverId'] ?? $content->owner_id;
    }

    private function assignedReviewer(User $actor, Content $content, array $stage): bool
    {
        $reviewer = $this->reviewerId($content, $stage);

        return $reviewer !== null && $reviewer !== ''
            && $actor->isActive() && app(ContentAccess::class)->canView($actor, $content) && $actor->hasPermission('content.approve')
            && (string) $reviewer === (string) $actor->id;
    }

    public function canReview(User $actor, Content $content, array $stage): bool
    {
        return ($stage['reviewRequired'] ?? true) !== false
            && $this->assignedReviewer($actor, $content, $stage)
            && in_array($stage['status'] ?? '', self::WAITING, true)
            && ! in_array($content->status, ['published', 'archived', 'completed', 'cancelled', 'suspended'], true);
    }

    public function guardGeneric(array $input, ?Content $content, User $actor): void
    {
        if (($input['status'] ?? '') === 'approved' && $content?->status !== 'approved') {
            throw ValidationException::withMessages(['status' => 'تأیید محتوا فقط از بررسی مراحل مجاز است.']);
        }
        $canConfigure = $actor->hasPermission('content.edit');
        if ($content && ! $canConfigure) {
            foreach (['approverId' => $content->payload['approverId'] ?? null, 'ownerId' => $content->owner_id] as $field => $oldValue) {
                if (array_key_exists($field, $input) && (string) ($input[$field] ?? '') !== (string) ($oldValue ?? '')
                    && ($field === 'approverId' || collect($content->payload['stages'] ?? [])->contains(fn ($s) => in_array($s['status'] ?? '', self::WAITING, true)))) {
                    abort(403, 'تغییر مسئول بررسی نیازمند مجوز مدیریت گردش کار است.');
                }
            }
        }
        if (! isset($input['stages'])) {
            return;
        }
        $old = collect($content?->payload['stages'] ?? [])->keyBy('id');
        $incoming = collect($input['stages'])->keyBy('id');
        foreach ($old as $id => $stage) {
            abort_if(! $canConfigure && ! $incoming->has($id), 403, 'حذف مرحله نیازمند مجوز مدیریت گردش کار است.');
            if (in_array($stage['status'] ?? '', [...self::WAITING, 'approved', 'revisions_needed', 'needs_revision'], true) && ! $incoming->has($id)) {
                throw ValidationException::withMessages(['stages' => 'مرحلهٔ دارای تصمیم یا بررسی باز را نمی‌توان حذف کرد.']);
            }
            $hasForwardedOutput = collect($stage['outputs'] ?? [])->contains(
                fn ($output) => is_array($output) && ! empty($output['forwardedToStageId']),
            );
            $hasForwardedInput = collect($stage['inputs'] ?? [])->contains(
                fn ($input) => is_array($input) && ! empty($input['sourceOutputId']),
            );
            if (! $incoming->has($id) && ($hasForwardedOutput || $hasForwardedInput)) {
                throw ValidationException::withMessages(['stages' => 'مرحله‌ای که خروجی ارجاع‌شده دارد قابل حذف نیست.']);
            }
        }
        foreach ($incoming as $id => $stage) {
            $before = $old->get($id, []);
            $this->guardForwardingMetadata(is_array($before) ? $before : [], is_array($stage) ? $stage : []);
            if ($content && ! $canConfigure) {
                abort_unless($old->has($id), 403, 'افزودن مرحله نیازمند مجوز مدیریت گردش کار است.');
                foreach (['reviewerId', 'approverId', 'assigneeId', 'departmentId', 'title', 'stageKey', 'order'] as $field) {
                    abort_if((string) ($stage[$field] ?? '') !== (string) ($before[$field] ?? ''), 403, 'تغییر ساختار یا مسئول مرحله نیازمند مجوز مدیریت گردش کار است.');
                }
            }
            $changed = ($stage['status'] ?? null) !== ($before['status'] ?? null);
            $reviewDisabled = ($stage['reviewRequired'] ?? true) === false;
            $reviewOnlyStatuses = [...self::WAITING, 'approved', 'revisions_needed', 'needs_revision'];
            if ($reviewDisabled && in_array($stage['status'] ?? '', $reviewOnlyStatuses, true)) {
                throw ValidationException::withMessages(['stages' => 'مرحلهٔ بدون نیاز به ارزیاب نمی‌تواند در وضعیت بررسی، تأیید یا اصلاح باشد.']);
            }
            $normalizingDisabledReview = $canConfigure && $reviewDisabled
                && ($before['reviewRequired'] ?? true) !== false
                && in_array($before['status'] ?? '', $reviewOnlyStatuses, true)
                && in_array($stage['status'] ?? '', ['in_progress', 'completed'], true);
            if ($changed && ! $normalizingDisabledReview && (in_array($before['status'] ?? '', [...self::WAITING, 'approved'], true) || in_array($stage['status'] ?? '', ['approved', 'revisions_needed', 'needs_revision'], true))) {
                throw ValidationException::withMessages(['stages' => 'تأیید یا رد را از فرمان بررسی مرحله انجام دهید.']);
            }
            foreach (['approvedBy', 'approvedAt', 'approvalNotes', 'rejectionReason', '_reviewDecision'] as $field) {
                if (($stage[$field] ?? null) !== ($before[$field] ?? null)) {
                    throw ValidationException::withMessages(['stages' => 'اطلاعات تصمیم فقط در سرور ثبت می‌شود.']);
                }
            }
        }
    }

    private function guardForwardingMetadata(array $before, array $incoming): void
    {
        $protectedOutputFields = ['forwardedToStageId', 'forwardedAt', 'forwardedBy'];
        $beforeOutputs = collect($before['outputs'] ?? [])->filter('is_array')->keyBy('id');
        $incomingOutputs = collect($incoming['outputs'] ?? [])->filter('is_array')->keyBy('id');
        foreach ($beforeOutputs as $id => $output) {
            if (! empty($output['forwardedToStageId']) && ! $incomingOutputs->has($id)) {
                throw ValidationException::withMessages(['stages' => 'خروجی ارجاع‌شده را نمی‌توان با ویرایش عمومی حذف کرد.']);
            }
        }
        foreach ($incomingOutputs as $id => $output) {
            $oldOutput = $beforeOutputs->get($id, []);
            $fields = $protectedOutputFields;
            if (! empty($oldOutput['forwardedToStageId']) || ! empty($output['forwardedToStageId'])) {
                $fields = [...$fields, 'name', 'type', 'fileType', 'isRequired', 'value', 'url', 'assetId', 'fileName', 'fileSize', 'isDelivered', 'uploadedAt', 'uploadedBy', 'deliveredAt', 'deliveredBy'];
            }
            foreach ($fields as $field) {
                if (($output[$field] ?? null) !== ($oldOutput[$field] ?? null)) {
                    throw ValidationException::withMessages(['stages' => 'اطلاعات ارجاع خروجی فقط در سرور ثبت می‌شود.']);
                }
            }
        }

        $protectedInputFields = ['sourceStageId', 'sourceOutputId', 'forwardedAt', 'forwardedBy'];
        $beforeInputs = collect($before['inputs'] ?? [])->filter('is_array')->keyBy('id');
        $incomingInputs = collect($incoming['inputs'] ?? [])->filter('is_array')->keyBy('id');
        foreach ($beforeInputs as $id => $input) {
            if (! empty($input['sourceOutputId']) && ! $incomingInputs->has($id)) {
                throw ValidationException::withMessages(['stages' => 'ورودی ارجاع‌شده را نمی‌توان با ویرایش عمومی حذف کرد.']);
            }
        }
        foreach ($incomingInputs as $id => $input) {
            $oldInput = $beforeInputs->get($id, []);
            $fields = $protectedInputFields;
            if (! empty($oldInput['sourceOutputId']) || ! empty($input['sourceOutputId'])) {
                $fields = [...$fields, 'title', 'type', 'description', 'isReady', 'contentRef'];
            }
            foreach ($fields as $field) {
                if (($input[$field] ?? null) !== ($oldInput[$field] ?? null)) {
                    throw ValidationException::withMessages(['stages' => 'اطلاعات ورودی ارجاع‌شده فقط در سرور ثبت می‌شود.']);
                }
            }
        }
    }

    public function forwardOutput(User $actor, Content $content, string $stageId, string $outputId, string $expectedVersion): Content
    {
        return DB::transaction(function () use ($actor, $content, $stageId, $outputId, $expectedVersion) {
            $actor = $actor->fresh();
            $fresh = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor && $actor->isActive() && app(ContentAccess::class)->canView($actor, $fresh), 403);
            abort_if(in_array($fresh->status, ['published', 'archived', 'completed', 'cancelled', 'suspended'], true), 409, 'در وضعیت فعلی محتوا امکان ارجاع خروجی وجود ندارد.');

            $payload = $fresh->payload ?? [];
            $stages = array_values(is_array($payload['stages'] ?? null) ? $payload['stages'] : []);
            $stageIndex = collect($stages)->search(fn ($stage) => is_array($stage) && (string) ($stage['id'] ?? '') === $stageId);
            abort_if($stageIndex === false, 404, 'مرحلهٔ محتوا پیدا نشد.');
            $orderedIndexes = collect(array_keys($stages))->sortBy(
                fn ($index) => is_array($stages[$index]) ? (int) ($stages[$index]['order'] ?? $index) : PHP_INT_MAX,
            )->values();
            $stagePosition = $orderedIndexes->search($stageIndex, true);
            $nextStageIndex = $stagePosition === false ? null : $orderedIndexes->get($stagePosition + 1);
            abort_if($nextStageIndex === null || ! isset($stages[$nextStageIndex]) || ! is_array($stages[$nextStageIndex]), 422, 'برای آخرین مرحله، مرحلهٔ بعدی وجود ندارد.');

            $stage = $stages[$stageIndex];
            $nextStage = $stages[$nextStageIndex];
            $outputIndex = collect($stage['outputs'] ?? [])->search(
                fn ($output) => is_array($output) && (string) ($output['id'] ?? '') === $outputId,
            );
            abort_if($outputIndex === false, 404, 'خروجی مرحله پیدا نشد.');
            $output = $stage['outputs'][$outputIndex];
            $delivered = ($output['isDelivered'] ?? false) === true
                || collect(['value', 'url', 'assetId', 'fileName'])->contains(fn ($field) => ! empty($output[$field]));
            abort_unless($delivered, 422, 'فقط خروجی تحویل‌شده قابل ارجاع است.');

            $reviewer = $this->reviewerId($fresh, $stage);
            if ($reviewer !== null && $reviewer !== '') {
                abort_unless($this->assignedReviewer($actor, $fresh, $stage), 403, 'فقط ارزیاب تعیین‌شده می‌تواند خروجی را ارجاع دهد.');
                abort_unless(in_array($stage['status'] ?? '', [...self::WAITING, 'approved', 'completed'], true), 409, 'خروجی پس از ارسال مرحله برای ارزیابی قابل ارجاع است.');
            } else {
                abort_unless((string) ($stage['assigneeId'] ?? '') === (string) $actor->id, 403, 'در مرحلهٔ بدون ارزیاب فقط مسئول مرحله می‌تواند خروجی را ارجاع دهد.');
                abort_unless(in_array($stage['status'] ?? '', ['in_progress', 'completed', 'approved'], true), 409, 'این مرحله هنوز برای ارجاع خروجی آماده نیست.');
            }

            $nextStageId = (string) ($nextStage['id'] ?? '');
            abort_if($nextStageId === '', 422, 'شناسهٔ مرحلهٔ بعد معتبر نیست.');
            if (($output['forwardedToStageId'] ?? null) === $nextStageId) {
                return $fresh;
            }
            abort_unless(hash_equals(self::version($fresh), $expectedVersion), 409, 'اطلاعات خروجی تغییر کرده است؛ محتوا را دوباره باز کنید.');
            abort_if(! empty($output['forwardedToStageId']), 409, 'این خروجی قبلاً به یک مرحله ارجاع شده است.');

            $time = now()->toIso8601String();
            $event = [
                'id' => (string) Str::uuid(),
                'userId' => (string) $actor->id,
                'userName' => $actor->name,
                'action' => 'ارجاع خروجی به مرحله بعد',
                'details' => sprintf('«%s» به مرحله «%s» ارجاع شد.', $output['name'] ?? 'خروجی', $nextStage['title'] ?? 'مرحله بعد'),
                'timestamp' => $time,
            ];
            $stage['outputs'][$outputIndex] = [
                ...$output,
                'forwardedToStageId' => $nextStageId,
                'forwardedAt' => $time,
                'forwardedBy' => (string) $actor->id,
            ];
            $stage['activityLog'] = [...($stage['activityLog'] ?? []), $event];

            $nextInputs = array_values(is_array($nextStage['inputs'] ?? null) ? $nextStage['inputs'] : []);
            $existingInput = collect($nextInputs)->search(
                fn ($input) => is_array($input)
                    && (string) ($input['sourceStageId'] ?? '') === $stageId
                    && (string) ($input['sourceOutputId'] ?? '') === $outputId,
            );
            $input = [
                'id' => $existingInput === false ? (string) Str::uuid() : ($nextInputs[$existingInput]['id'] ?? (string) Str::uuid()),
                'title' => $output['name'] ?? $output['fileName'] ?? 'خروجی مرحله قبل',
                'type' => 'dependency_stage',
                'description' => sprintf('خروجی ارجاع‌شده از مرحله «%s»', $stage['title'] ?? 'مرحله قبل'),
                'isReady' => true,
                'sourceStageId' => $stageId,
                'sourceOutputId' => $outputId,
                'contentRef' => mb_substr((string) ($output['assetId'] ?? $output['url'] ?? $output['fileName'] ?? $output['value'] ?? ''), 0, 500),
                'forwardedAt' => $time,
                'forwardedBy' => (string) $actor->id,
            ];
            if ($existingInput === false) {
                $nextInputs[] = $input;
            } else {
                $nextInputs[$existingInput] = $input;
            }
            $nextStage['inputs'] = $nextInputs;
            $nextStage['activityLog'] = [...($nextStage['activityLog'] ?? []), $event];
            if (($nextStage['status'] ?? '') === 'pending_dependency') {
                $nextStage['status'] = 'not_started';
                $payload['currentStageIndex'] = $nextStageIndex;
            }
            $stages[$stageIndex] = $stage;
            $stages[$nextStageIndex] = $nextStage;
            $payload['stages'] = $stages;
            $payload['history'] = [...($payload['history'] ?? []), $event];
            $fresh->update(['payload' => $payload]);
            app(ContentStageTaskSync::class)->sync($fresh->refresh());

            return $fresh->refresh();
        }, 3);
    }

    public function decide(User $actor, Content $content, string $stageId, array $data): Content
    {
        return DB::transaction(function () use ($actor, $content, $stageId, $data) {
            $actor = $actor->fresh();
            $fresh = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            $payload = $fresh->payload ?? [];
            $stages = array_values($payload['stages'] ?? []);
            $index = collect($stages)->search(fn ($s) => (string) ($s['id'] ?? '') === $stageId);
            abort_if($index === false, 404);
            abort_unless($actor && $this->assignedReviewer($actor, $fresh, $stages[$index]), 403, 'این بررسی در اختیار شما نیست.');
            abort_unless($this->canReview($actor, $fresh, $stages[$index]), 409, 'این مرحله دیگر در انتظار بررسی نیست.');
            abort_unless(hash_equals(self::version($fresh), $data['expectedVersion']), 409, 'اطلاعات مرحله تغییر کرده است؛ دوباره آن را باز کنید.');
            $approved = $data['decision'] === 'approve';
            $time = now()->toIso8601String();
            $event = ['id' => (string) Str::uuid(), 'userId' => (string) $actor->id, 'userName' => $actor->name,
                'action' => $approved ? 'تأیید مرحله' : 'عودت مرحله برای اصلاح', 'timestamp' => $time, 'note' => $data['note'] ?? ''];
            $stages[$index] = [...$stages[$index], 'status' => $approved ? 'approved' : 'revisions_needed',
                '_reviewDecision' => $event, 'activityLog' => [...($stages[$index]['activityLog'] ?? []), $event]];
            if ($approved) {
                $stages[$index]['approvedBy'] = (string) $actor->id;
                $stages[$index]['approvedAt'] = $time;
                $stages[$index]['approvalNotes'] = $data['note'] ?? '';
                $stages[$index]['completedAt'] = today()->toDateString();
                if (isset($stages[$index + 1]) && ($stages[$index + 1]['status'] ?? '') === 'pending_dependency') {
                    $stages[$index + 1]['status'] = 'not_started';
                    $stages[$index + 1]['inputs'] = array_map(fn ($input) => [...$input, 'isReady' => true], $stages[$index + 1]['inputs'] ?? []);
                    $payload['currentStageIndex'] = $index + 1;
                }
            } else {
                $stages[$index]['rejectionReason'] = $data['note'];
            }
            $payload['stages'] = $stages;
            $payload['history'] = [...($payload['history'] ?? []), $event];
            // No destructive reopening/new automation on rejection. Keep prior work/history intact.
            Task::where('content_id', $fresh->id)->where('content_stage_id', $stageId)
                ->whereIn('kind', $approved ? ['content_review', 'content_work', 'content_correction'] : ['content_review'])
                ->whereNotIn('status', ['completed', 'archived'])->update(['status' => 'completed']);
            $status = $fresh->status;
            if ($approved && collect($stages)->every(fn ($s) => in_array($s['status'] ?? '', ['approved', 'completed', 'skipped'], true))) {
                $status = 'approved';
                $payload['status'] = $status;
            }
            $fresh->update(['payload' => $payload, 'status' => $status]);
            if (! $approved) {
                app(ContentCorrection::class)->create($fresh, $stages[$index], $event, $actor);
            }
            app(ContentStageTaskSync::class)->sync($fresh->refresh());
            app(TaskOperations::class)->updateProjectProgress($fresh->project_id);

            return $fresh->refresh();
        }, 3);
    }
}
