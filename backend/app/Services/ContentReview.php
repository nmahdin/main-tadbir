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
        $canConfigure = $actor->isAdmin() || $actor->hasPermission('content.edit');
        if ($content) {
            $existingStages = is_array($content->payload['stages'] ?? null) ? $content->payload['stages'] : [];
            if (array_key_exists('status', $input) && (string) $input['status'] !== (string) $content->status && $existingStages !== []
                && $input['status'] !== 'archived') {
                throw ValidationException::withMessages(['status' => 'وضعیت محتوای دارای گردش کار از وضعیت مراحل به‌دست می‌آید؛ فقط بایگانی از این مسیر مجاز است.']);
            }
            $hasOpenReview = collect($existingStages)
                ->contains(fn ($stage) => is_array($stage) && in_array($stage['status'] ?? '', self::WAITING, true));
            foreach (['approverId' => $content->payload['approverId'] ?? null, 'ownerId' => $content->owner_id] as $field => $oldValue) {
                if (array_key_exists($field, $input) && (string) ($input[$field] ?? '') !== (string) ($oldValue ?? '')
                    && ($hasOpenReview || (! $canConfigure && $field === 'approverId'))) {
                    abort(403, 'مسئولان محتوای در حال بررسی با ویرایش عمومی تغییر نمی‌کنند.');
                }
            }
        }
        if (! isset($input['stages'])) {
            return;
        }
        $this->guardStageDependencies($input['stages']);
        $old = collect($content?->payload['stages'] ?? [])->keyBy('id');
        $incoming = collect($input['stages'])->keyBy('id');
        if (! $content) {
            foreach ($incoming as $stage) {
                if (! is_array($stage) || ! in_array($stage['status'] ?? 'not_started', ['pending_dependency', 'not_started'], true)) {
                    throw ValidationException::withMessages(['stages' => 'مراحل محتوای جدید باید با وضعیت شروع‌نشده یا در انتظار پیش‌نیاز ایجاد شوند.']);
                }
            }
        }
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
        $existingStages = is_array($content?->payload['stages'] ?? null) ? array_values($content->payload['stages']) : [];
        $incomingStages = array_values($input['stages']);
        foreach ($incoming as $id => $stage) {
            $before = $old->get($id, []);
            $before = is_array($before) ? $before : [];
            $stage = is_array($stage) ? $stage : [];
            $stageIndex = collect($incomingStages)->search(fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === (string) $id);
            $beforeIndex = collect($existingStages)->search(fn ($candidate) => is_array($candidate) && (string) ($candidate['id'] ?? '') === (string) $id);
            $beforeDependencies = $beforeIndex === false ? [] : ContentStageTaskSync::dependencyIds($before, (int) $beforeIndex, $existingStages);
            $incomingDependencies = $stageIndex === false ? [] : ContentStageTaskSync::dependencyIds($stage, (int) $stageIndex, $incomingStages);
            sort($beforeDependencies);
            sort($incomingDependencies);
            $dependenciesChanged = $beforeDependencies !== $incomingDependencies;
            if ($content && $old->has($id) && array_key_exists('reviewRequired', $stage)
                && (bool) ($before['reviewRequired'] ?? true) !== (bool) $stage['reviewRequired']) {
                abort_if(! in_array($before['status'] ?? '', ['pending_dependency', 'ready', 'not_started'], true), 409, 'نیاز به ارزیابی پس از شروع مرحله قابل تغییر نیست.');
            }
            if ($content && $old->has($id) && $dependenciesChanged) {
                abort_if(! $canConfigure, 403, 'تغییر پیش‌نیازها نیازمند مجوز مدیریت گردش کار است.');
                abort_if(! in_array($before['status'] ?? '', ['pending_dependency', 'ready', 'not_started'], true), 409, 'پیش‌نیازهای مرحله پس از شروع کار قابل تغییر نیستند.');
            }
            $this->guardForwardingMetadata($before, $stage);
            if ($content && in_array($before['status'] ?? '', self::WAITING, true)) {
                foreach (['reviewerId', 'approverId'] as $field) {
                    abort_if((string) ($stage[$field] ?? '') !== (string) ($before[$field] ?? ''), 403, 'ارزیاب چرخهٔ بررسی باز با ویرایش عمومی تغییر نمی‌کند.');
                }
            }
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
            if ($changed && $content) {
                $this->guardWorkflowStatusTransition($actor, $content, $before, $stage, (int) ($stageIndex === false ? 0 : $stageIndex), $incomingStages, $canConfigure);
            }
            foreach (['approvedBy', 'approvedAt', 'approvalNotes', 'rejectionReason', '_reviewDecision'] as $field) {
                if (($stage[$field] ?? null) !== ($before[$field] ?? null)) {
                    throw ValidationException::withMessages(['stages' => 'اطلاعات تصمیم فقط در سرور ثبت می‌شود.']);
                }
            }
        }
    }

    /** @param array<int, mixed> $stages */
    private function guardStageDependencies(array $stages): void
    {
        $stages = array_values($stages);
        $byId = [];
        foreach ($stages as $stage) {
            if (! is_array($stage)) {
                throw ValidationException::withMessages(['stages' => 'ساختار یکی از مراحل معتبر نیست.']);
            }
            $id = trim((string) ($stage['id'] ?? ''));
            if ($id === '' || array_key_exists($id, $byId)) {
                throw ValidationException::withMessages(['stages' => 'شناسهٔ مراحل باید یکتا و معتبر باشد.']);
            }
            if (array_key_exists('dependsOnStageIds', $stage) && ! is_array($stage['dependsOnStageIds'])) {
                throw ValidationException::withMessages(['stages' => 'فهرست پیش‌نیازهای مرحله معتبر نیست.']);
            }
            $byId[$id] = $stage;
        }

        $graph = [];
        foreach ($stages as $index => $stage) {
            $id = (string) $stage['id'];
            $dependencies = ContentStageTaskSync::dependencyIds($stage, $index, $stages);
            if (count($dependencies) !== count(array_unique($dependencies))) {
                throw ValidationException::withMessages(['stages' => 'یک پیش‌نیاز در مرحله بیش از یک‌بار انتخاب شده است.']);
            }
            foreach ($dependencies as $dependencyId) {
                if ($dependencyId === $id || ! array_key_exists($dependencyId, $byId)) {
                    throw ValidationException::withMessages(['stages' => 'پیش‌نیاز مرحله باید شناسهٔ معتبرِ مرحله‌ای دیگر باشد.']);
                }
            }
            $graph[$id] = $dependencies;
        }

        $visiting = [];
        $visited = [];
        $visit = function (string $id) use (&$visit, &$visiting, &$visited, $graph): bool {
            if (isset($visiting[$id])) {
                return true;
            }
            if (isset($visited[$id])) {
                return false;
            }
            $visiting[$id] = true;
            foreach ($graph[$id] ?? [] as $dependencyId) {
                if ($visit($dependencyId)) {
                    return true;
                }
            }
            unset($visiting[$id]);
            $visited[$id] = true;

            return false;
        };
        foreach (array_keys($graph) as $id) {
            if ($visit((string) $id)) {
                throw ValidationException::withMessages(['stages' => 'وابستگی مراحل حلقه ایجاد می‌کند؛ پیش‌نیازها را بازبینی کنید.']);
            }
        }
    }

    /** Protect workflow-derived transitions while preserving explicit skip and review commands. */
    private function guardWorkflowStatusTransition(User $actor, Content $content, array $before, array $incoming, int $index, array $stages, bool $canConfigure): void
    {
        $from = (string) ($before['status'] ?? 'not_started');
        $to = (string) ($incoming['status'] ?? 'not_started');
        $assignedToActor = is_numeric($incoming['assigneeId'] ?? null)
            && (int) $incoming['assigneeId'] === (int) $actor->id;
        $dependenciesSatisfied = ContentStageTaskSync::dependenciesSatisfied($incoming, $index, $stages);
        $outputsComplete = collect($incoming['outputs'] ?? [])->every(function ($output): bool {
            if (! is_array($output) || ! ($output['isRequired'] ?? false)) {
                return true;
            }

            return ($output['isDelivered'] ?? false) === true
                || collect(['value', 'url', 'assetId', 'fileName'])->contains(fn ($field) => ! empty($output[$field]));
        });
        $reviewRequired = ($incoming['reviewRequired'] ?? true) !== false;

        if ($to === 'in_progress' && in_array($from, ['ready', 'not_started', 'needs_revision', 'revisions_needed'], true)) {
            abort_unless($dependenciesSatisfied, 409, 'تا آماده‌شدن همهٔ پیش‌نیازها نمی‌توان مرحله را آغاز کرد.');
            abort_unless($assignedToActor, 403, 'فقط مسئول مرحله می‌تواند آن را آغاز یا اصلاح کند.');

            return;
        }
        if (in_array($to, ['pending_approval', 'ready_for_review'], true) && $from === 'in_progress') {
            abort_unless($reviewRequired, 422, 'مرحلهٔ بدون ارزیاب نباید برای بررسی ارسال شود.');
            abort_unless($assignedToActor, 403, 'فقط مسئول مرحله می‌تواند آن را برای بررسی ارسال کند.');
            abort_unless($outputsComplete, 422, 'پیش از ارسال برای بررسی، همهٔ خروجی‌های ضروری را تحویل دهید.');

            return;
        }
        if ($to === 'completed' && $from === 'in_progress') {
            abort_unless(! $reviewRequired, 422, 'مرحلهٔ نیازمند ارزیابی فقط با فرمان تأیید تکمیل می‌شود.');
            abort_unless($assignedToActor, 403, 'فقط مسئول مرحله می‌تواند آن را تکمیل کند.');
            abort_unless($outputsComplete, 422, 'پیش از تکمیل مرحله، همهٔ خروجی‌های ضروری را تحویل دهید.');

            return;
        }
        if ($to === 'skipped' && in_array($from, ['pending_dependency', 'ready', 'not_started'], true)) {
            abort_unless($canConfigure, 403, 'عبور از مرحله نیازمند مجوز مدیریت گردش کار است.');

            return;
        }
        if ($from === 'skipped' && $to === 'not_started') {
            abort_unless($canConfigure, 403, 'بازگردانی مرحلهٔ عبورشده نیازمند مجوز مدیریت گردش کار است.');
            abort_unless($dependenciesSatisfied, 409, 'تا آماده‌شدن همهٔ پیش‌نیازها نمی‌توان مرحله را بازگرداند.');
            abort_unless(! $this->hasStartedDependentStage((string) ($incoming['id'] ?? ''), $stages), 409, 'ابتدا مراحل وابسته‌ای را که شروع شده‌اند بازگردانی کنید.');

            return;
        }

        throw ValidationException::withMessages(['stages' => 'این تغییر وضعیت از گردش کار مجاز نیست؛ از اقدام مرحله یا فرمان بررسی استفاده کنید.']);
    }

    /** Reopening a skipped prerequisite must not invalidate a downstream stage already underway. */
    private function hasStartedDependentStage(string $stageId, array $stages): bool
    {
        foreach ($stages as $index => $stage) {
            if (! is_array($stage) || (string) ($stage['id'] ?? '') === $stageId
                || ! in_array($stageId, ContentStageTaskSync::dependencyIds($stage, (int) $index, $stages), true)) {
                continue;
            }
            if (! in_array($stage['status'] ?? '', ['pending_dependency', 'ready', 'not_started'], true)) {
                return true;
            }
        }

        return false;
    }

    private function guardForwardingMetadata(array $before, array $incoming): void
    {
        $protectedOutputFields = ['forwardedToStageId', 'forwardedAt', 'forwardedBy'];
        $beforeOutputs = collect($before['outputs'] ?? [])->filter(fn ($output) => is_array($output))->keyBy('id');
        $incomingOutputs = collect($incoming['outputs'] ?? [])->filter(fn ($output) => is_array($output))->keyBy('id');
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
        $beforeInputs = collect($before['inputs'] ?? [])->filter(fn ($input) => is_array($input))->keyBy('id');
        $incomingInputs = collect($incoming['inputs'] ?? [])->filter(fn ($input) => is_array($input))->keyBy('id');
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
            $dependentIndexes = collect(array_keys($stages))
                ->filter(function ($candidateIndex) use ($stages, $stageIndex, $stageId): bool {
                    if ($candidateIndex === $stageIndex || ! is_array($stages[$candidateIndex] ?? null)
                        || in_array($stages[$candidateIndex]['status'] ?? '', ['approved', 'completed', 'skipped'], true)) {
                        return false;
                    }

                    return in_array($stageId, ContentStageTaskSync::dependencyIds($stages[$candidateIndex], (int) $candidateIndex, $stages), true);
                })
                ->sortBy(fn ($candidateIndex) => (int) ($stages[$candidateIndex]['order'] ?? $candidateIndex))
                ->values();
            $nextStageIndex = $dependentIndexes->first();
            abort_if($nextStageIndex === null, 422, 'این خروجی پیش‌نیازِ هیچ مرحلهٔ بازِ دیگری نیست.');

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
