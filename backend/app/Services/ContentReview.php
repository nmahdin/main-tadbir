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

    private function assignedReviewer(User $actor, Content $content, array $stage): bool
    {
        $reviewer = $stage['reviewerId'] ?? $stage['approverId'] ?? $content->payload['approverId'] ?? $content->owner_id;

        return $actor->isActive() && app(ContentAccess::class)->canView($actor, $content) && $actor->hasPermission('content.approve')
            && (string) $reviewer === (string) $actor->id;
    }

    public function canReview(User $actor, Content $content, array $stage): bool
    {
        return $this->assignedReviewer($actor, $content, $stage)
            && in_array($stage['status'] ?? '', self::WAITING, true)
            && ! in_array($content->status, ['published', 'archived', 'completed', 'cancelled', 'suspended'], true);
    }

    public function guardGeneric(array $input, ?Content $content, User $actor): void
    {
        if (($input['status'] ?? '') === 'approved' && $content?->status !== 'approved') {
            throw ValidationException::withMessages(['status' => 'تأیید محتوا فقط از بررسی مراحل مجاز است.']);
        }
        $canConfigure = $actor->hasAnyPermission(['content.manage_process', 'workflows.manage']);
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
        }
        foreach ($incoming as $id => $stage) {
            $before = $old->get($id, []);
            if ($content && ! $canConfigure) {
                abort_unless($old->has($id), 403, 'افزودن مرحله نیازمند مجوز مدیریت گردش کار است.');
                foreach (['reviewerId', 'approverId', 'assigneeId', 'departmentId', 'title', 'stageKey', 'order'] as $field) {
                    abort_if((string) ($stage[$field] ?? '') !== (string) ($before[$field] ?? ''), 403, 'تغییر ساختار یا مسئول مرحله نیازمند مجوز مدیریت گردش کار است.');
                }
            }
            $changed = ($stage['status'] ?? null) !== ($before['status'] ?? null);
            if ($changed && (in_array($before['status'] ?? '', [...self::WAITING, 'approved'], true) || in_array($stage['status'] ?? '', ['approved', 'revisions_needed', 'needs_revision'], true))) {
                throw ValidationException::withMessages(['stages' => 'تأیید یا رد را از فرمان بررسی مرحله انجام دهید.']);
            }
            foreach (['approvedBy', 'approvedAt', 'approvalNotes', 'rejectionReason', '_reviewDecision'] as $field) {
                if (($stage[$field] ?? null) !== ($before[$field] ?? null)) {
                    throw ValidationException::withMessages(['stages' => 'اطلاعات تصمیم فقط در سرور ثبت می‌شود.']);
                }
            }
        }
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
            app(TaskOperations::class)->updateProjectProgress($fresh->project_id);

            return $fresh->refresh();
        }, 3);
    }
}
