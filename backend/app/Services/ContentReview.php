<?php

namespace App\Services;

use App\Models\Content;
use App\Models\Task;
use App\Models\User;
use App\Support\Content\StageAdvanceMode;
use App\Support\OrganizationTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** A command for the existing content-stage review, not a new workflow engine. */
final class ContentReview
{
    public const STATUSES = ['pending_dependency', 'ready', 'not_started', 'in_progress', 'ready_for_review', 'pending_approval', 'needs_revision', 'revisions_needed', 'approved', 'completed', 'skipped'];

    public const WAITING = ['pending_approval', 'ready_for_review'];

    /** Structural stage fields a generic PATCH may never rewrite. */
    public const STRUCTURAL_FIELDS = ['stageKey', 'order', 'departmentId', 'assigneeId', 'reviewerId', 'approverId',
        'advanceMode', 'reviewRequired', 'reviewerStrategy', 'dependsOnStageIds', 'title'];

    public static function version(Content $content): string
    {
        return hash('sha256', json_encode([$content->status, $content->owner_id, $content->payload['approverId'] ?? null, $content->payload['stages'] ?? []]));
    }

    /** How the next stage of this one becomes active. Legacy stages default to approval. */
    public static function advanceMode(array $stage): string
    {
        return StageAdvanceMode::of($stage['advanceMode'] ?? null);
    }

    public static function requiresForwardedOutput(array $stage): bool
    {
        return StageAdvanceMode::isForwardedOutput($stage['advanceMode'] ?? null);
    }

    private function reviewerId(Content $content, array $stage): int|string|null
    {
        if (($stage['reviewRequired'] ?? true) === false) {
            return null;
        }

        $strategy = (string) ($stage['reviewerStrategy'] ?? 'stage_reviewer');
        if ($strategy === 'content_owner') {
            return $content->owner_id;
        }
        if ($strategy === 'department_manager') {
            $departmentId = $stage['departmentId'] ?? $content->payload['departmentId'] ?? null;
            if ($departmentId !== null && $departmentId !== '') {
                $managerId = \App\Models\Department::query()->whereKey($departmentId)->value('manager_id');
                if ($managerId) {
                    return $managerId;
                }
            }
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

    /**
     * Permission (may this user restructure the workflow at all?) is deliberately
     * separate from assignment (is this user responsible for this stage?).
     * `content.workflow.manage` is the narrow grant. Ordinary `content.edit`
     * remains sufficient for normal content fields, never workflow structure.
     */
    public function canConfigureWorkflow(User $actor): bool
    {
        return $actor->isAdmin() || $actor->hasPermission('content.workflow.manage');
    }

    /**
     * May this actor swap the responsible person / reviewer of an existing stage
     * without a full workflow redesign? Workflow managers already can; the
     * content-manager role runs the pipeline day to day and is allowed the same
     * narrow assignment right (but still cannot add/remove stages or change
     * advance/review policies — those stay behind `content.workflow.manage`).
     */
    public function canAssignStagePeople(User $actor): bool
    {
        return $this->canConfigureWorkflow($actor) || $actor->role?->key === 'content_manager';
    }

    public function guardGeneric(array $input, ?Content $content, User $actor): void
    {
        if (($input['status'] ?? '') === 'approved' && $content?->status !== 'approved') {
            throw ValidationException::withMessages(['status' => 'تأیید محتوا فقط از بررسی مراحل مجاز است.']);
        }
        $canConfigure = $this->canConfigureWorkflow($actor);
        $canAssignPeople = $this->canAssignStagePeople($actor);
        if ($content) {
            $hasOpenReview = collect($content->payload['stages'] ?? [])
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
        $old = collect($content?->payload['stages'] ?? [])->keyBy('id');
        $incoming = collect($input['stages'])->keyBy('id');
        foreach ($old as $id => $stage) {
            abort_if(! $canConfigure && ! $incoming->has($id), 403, 'حذف مرحله نیازمند مجوز مدیریت گردش کار است.');
            if (in_array($stage['status'] ?? '', [...self::WAITING, 'approved', 'revisions_needed', 'needs_revision'], true) && ! $incoming->has($id)) {
                // مرحلهٔ دارای تصمیم ثبت‌شده تاریخ جریان است و حذف نمی‌شود؛ اما
                // بررسیِ باز (بدون تصمیم) را مدیر گردش کار می‌تواند حذف کند تا
                // پس از شروع جریان، ساختار قابل اصلاح بماند.
                $decided = ! empty($stage['_reviewDecision'])
                    || in_array($stage['status'] ?? '', ['approved', 'revisions_needed', 'needs_revision'], true);
                if ($decided || ! $canConfigure) {
                    throw ValidationException::withMessages(['stages' => 'مرحلهٔ دارای تصمیم یا بررسی باز را نمی‌توان حذف کرد.']);
                }
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
            // جانشینی ارزیاب یک مرحلهٔ در حال بررسی، کار مدیریت گردش کار است
            // (مثلاً خروج ارزیاب از دپارتمان)؛ برای بقیهٔ کاربران همان ممنوعیت
            // قبلی برجاست. تسک بررسی هم در `ContentStageTaskSync` به ارزیاب
            // تازه منتقل می‌شود.
            if ($content && ! $canConfigure && in_array($before['status'] ?? '', self::WAITING, true)) {
                foreach (['reviewerId', 'approverId'] as $field) {
                    if ($field === 'reviewerId' && $canAssignPeople) {
                        continue;
                    }
                    abort_if(! $this->sameProtectedValue($stage[$field] ?? null, $before[$field] ?? null), 403, 'ارزیاب چرخهٔ بررسی باز با ویرایش عمومی تغییر نمی‌کند.');
                }
            }
            if ($content && ! $canConfigure) {
                abort_unless($old->has($id), 403, 'افزودن مرحله نیازمند مجوز مدیریت گردش کار است.');
                foreach (self::STRUCTURAL_FIELDS as $field) {
                    // جانشینی مسئول/ارزیاب همان مرحله کار روزمرهٔ مدیر محتواست؛
                    // تغییر بقیهٔ ساختار همچنان مجوز مدیریت گردش کار می‌خواهد.
                    if ($canAssignPeople && in_array($field, ['assigneeId', 'reviewerId'], true)) {
                        continue;
                    }
                    if ($canAssignPeople && $field === 'reviewerStrategy'
                        && ($stage['reviewerStrategy'] ?? 'stage_reviewer') === 'stage_reviewer'
                        && (string) ($stage['reviewerId'] ?? '') !== '') {
                        continue;
                    }
                    // مقایسهٔ امن برای فیلدهای ساختاری؛ `dependsOnStageIds`
                    // آرایه است و تبدیل مستقیم آن به رشته، خطای ۵۰۰ می‌داد.
                    abort_if(! $this->sameProtectedValue($stage[$field] ?? null, $before[$field] ?? null), 403, 'تغییر ساختار یا مسئول مرحله نیازمند مجوز مدیریت جریان محتواست.');
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
            // تصمیم مرحله (تأیید/رد) فقط از فرمان بررسی همان مرحله می‌آید. اما
            // دارندهٔ مجوز «مدیریت گردش کار» باید بتواند وضعیت سرگردان را اصلاح
            // کند — مثلاً ارزیابی‌ای که اشتباه آغاز شده یا مرحلهٔ تأییدشده‌ای که
            // باید بسته شود — وگرنه پس از شروع جریان، هیچ مسیری برای اصلاح آن
            // باقی نمی‌ماند. ورود به وضعیت تصمیم برای همه بسته است.
            $enteringDecision = in_array($stage['status'] ?? '', ['approved', 'revisions_needed', 'needs_revision'], true);
            $leavingReviewOrDecision = in_array($before['status'] ?? '', [...self::WAITING, 'approved'], true);
            $blockedStatusChange = $changed && ! $normalizingDisabledReview
                && ($enteringDecision || ($leavingReviewOrDecision && ! $canConfigure));
            if ($blockedStatusChange) {
                throw ValidationException::withMessages(['stages' => 'تأیید یا رد را از فرمان بررسی مرحله انجام دهید.']);
            }
            foreach (['approvedBy', 'approvedAt', 'approvalNotes', 'rejectionReason', '_reviewDecision'] as $field) {
                if (! $this->sameProtectedValue($stage[$field] ?? null, $before[$field] ?? null)) {
                    throw ValidationException::withMessages(['stages' => 'اطلاعات تصمیم فقط در سرور ثبت می‌شود.']);
                }
            }
        }
    }

    /**
     * مقایسهٔ امن فرادادهٔ حفاظت‌شدهٔ ارجاع و تصمیم.
     *
     * مرورگر همان مقدار ذخیره‌شده را برمی‌گرداند، اما همان مقدار می‌تواند در JSON
     * یک‌بار رشته و بار دیگر عدد باشد (`assetVersionId` را سرور رشته می‌نویسد و
     * کلاینت عدد می‌فرستد) یا `null` در برابر رشتهٔ خالی. مقایسهٔ سخت‌گیرانه همین
     * تفاوت نمایشی را «تغییر» می‌دید و ذخیرهٔ جریان محتوا را با ۴۲۲ می‌بست. این
     * تابع فقط همین تفاوت‌های نمایشی را برابر می‌داند و هیچ مقدار متفاوتی را
     * یکسان نمی‌بیند؛ پس گارد همان قدرت قبلی را دارد.
     */
    private function sameProtectedValue(mixed $left, mixed $right): bool
    {
        return $this->canonicalProtectedValue($left) === $this->canonicalProtectedValue($right);
    }

    private function canonicalProtectedValue(mixed $value): mixed
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return null;
            }

            return is_numeric($trimmed) ? (float) $trimmed : $trimmed;
        }
        if (is_array($value)) {
            $canonical = [];
            foreach ($value as $key => $item) {
                $canonical[(string) $key] = $this->canonicalProtectedValue($item);
            }
            ksort($canonical);

            return $canonical;
        }

        return $value;
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
                $fields = [...$fields, 'name', 'type', 'fileType', 'isRequired', 'value', 'url', 'assetId', 'assetVersionId', 'assetVersionNumber', 'fileName', 'fileSize', 'isDelivered', 'uploadedAt', 'uploadedBy', 'deliveredAt', 'deliveredBy'];
            }
            foreach ($fields as $field) {
                if (! $this->sameProtectedValue($output[$field] ?? null, $oldOutput[$field] ?? null)) {
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
                if (! $this->sameProtectedValue($input[$field] ?? null, $oldInput[$field] ?? null)) {
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
            // Forwarding is the activation signal for this stage, so every declared
            // input becomes ready at the same moment.
            $nextStage['inputs'] = array_map(fn ($input) => is_array($input) ? [...$input, 'isReady' => true] : $input, $nextInputs);
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
            app(ContentWatchNotifier::class)->meaningful($fresh->refresh(), $actor, 'output-forwarded:'.$event['id'],
                'یک خروجی از محتوای «'.$fresh->title.'» به مرحله بعد ارجاع شد.');

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
                $stages[$index]['completedAt'] = app(OrganizationTime::class)->date();
                // Explicit policy: an approval only advances the workflow by
                // itself when the stage says so. With `forwarded_output` the
                // next stage stays on pending_dependency until a Reviewer runs
                // the official forward command on a delivered output.
                $advancesNextStage = self::advanceMode($stages[$index]) === StageAdvanceMode::APPROVAL;
                if ($advancesNextStage && isset($stages[$index + 1]) && ($stages[$index + 1]['status'] ?? '') === 'pending_dependency') {
                    $stages[$index + 1]['status'] = 'not_started';
                    $stages[$index + 1]['inputs'] = array_map(fn ($input) => [...$input, 'isReady' => true], $stages[$index + 1]['inputs'] ?? []);
                    $payload['currentStageIndex'] = $index + 1;
                }
            } else {
                $stages[$index]['rejectionReason'] = $data['note'];
            }
            $payload['stages'] = $stages;
            $payload['history'] = [...($payload['history'] ?? []), $event];
            // The review cycle being closed is captured before it is completed so the
            // correction task can be keyed on it (see ContentCorrection).
            $closingReviewTask = Task::where('content_id', $fresh->id)->where('content_stage_id', $stageId)
                ->where('kind', 'content_review')->whereNotIn('status', ['completed', 'archived'])
                ->latest('id')->first();
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
                $correctionAssignee = null;
                if (! empty($data['correctionAssigneeId'])) {
                    $correctionAssignee = User::whereKey((int) $data['correctionAssigneeId'])->where('status', 'active')->first();
                    abort_unless($correctionAssignee && $this->validCorrectionAssignee($correctionAssignee, $fresh), 422,
                        'مسئول اصلاح باید کاربر فعال و عضو دامنه همین محتوا یا پروژه باشد.');
                }
                app(ContentCorrection::class)->create($fresh, $stages[$index], $event, $actor, $closingReviewTask, $correctionAssignee);
            }
            app(ContentStageTaskSync::class)->sync($fresh->refresh());
            app(TaskOperations::class)->updateProjectProgress($fresh->project_id);
            app(ContentWatchNotifier::class)->meaningful($fresh->refresh(), $actor, 'review-decision:'.$event['id'],
                ($approved ? 'یک مرحله تأیید شد: ' : 'یک مرحله برای اصلاح عودت شد: ').$fresh->title);

            return $fresh->refresh();
        }, 3);
    }

    private function validCorrectionAssignee(User $assignee, Content $content): bool
    {
        if (! $assignee->isActive() || ! app(ContentAccess::class)->canView($assignee, $content)) {
            return false;
        }
        if (! $content->project_id) {
            return true;
        }
        $project = \App\Models\Project::find($content->project_id);
        if (! $project) return false;

        return $assignee->role?->key === 'admin'
            || (int) $project->project_manager_id === (int) $assignee->id
            || $project->members()->whereKey($assignee->id)->exists();
    }
}
