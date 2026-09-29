<?php

namespace App\Services;

use App\Events\ContentPublished;
use App\Models\ActivityLog;
use App\Models\Content;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Synchronous publication slice. No queue worker, external request or required URL. */
final class ContentPublication
{
    public const KIND = 'content_publish';

    public static function version(Content $content): string
    {
        return hash('sha256', json_encode([$content->status, $content->payload['publishInfo'] ?? null,
            $content->payload['publisherId'] ?? null, $content->payload['_publication'] ?? null]));
    }

    public static function published(Content $content): bool
    {
        return $content->status === 'published' || ($content->payload['publishInfo']['status'] ?? null) === 'published';
    }

    public function authorize(User $actor): User
    {
        $actor = $actor->fresh();
        abort_unless($actor?->isActive() && app(ContentAccess::class)->canEnter($actor) && $actor->hasPermission('content.publish'), 403, 'ثبت انتشار نیازمند مجوز انتشار محتوا است.');

        return $actor;
    }

    private function checkVersion(Content $content, string $expected): void
    {
        abort_unless(hash_equals(self::version($content), $expected), 409, 'اطلاعات انتشار تغییر کرده است؛ محتوا را دوباره دریافت کنید.');
    }

    /** Capture exact task IDs before dispatch; a replay must never affect later tasks. */
    public function targets(Content $content)
    {
        $stageIds = collect($content->payload['stages'] ?? [])->filter(fn ($s) => is_array($s) && ($s['stageKey'] ?? null) === 'publish')
            ->pluck('id')->map(fn ($id) => (string) $id)->all();

        return Task::where('content_id', $content->id)->where(function ($q) use ($stageIds): void {
            $q->where('kind', self::KIND);
            if ($stageIds) {
                $q->orWhere(fn ($q) => $q->where('kind', 'content_work')->whereIn('content_stage_id', $stageIds));
            }
        });
    }

    public function publish(User $actor, Content $content, string $expected): Content
    {
        $actor = $this->authorize($actor);

        return DB::transaction(function () use ($actor, $content, $expected): Content {
            $content = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(ContentAccess::class)->canView($actor, $content), 403);
            // Repeated clicks, including a retry after a lost HTTP response, are no-ops.
            if (self::published($content)) {
                return $content;
            }
            $this->checkVersion($content, $expected);
            $eventId = (string) Str::uuid();
            $payload = $content->payload ?? [];
            $taskIds = $this->targets($content)->orderBy('id')->pluck('id')->all();
            $before = $content->status;
            $payload['publishInfo'] = [...($payload['publishInfo'] ?? []), 'status' => 'published',
                'date' => now()->toDateString(), 'time' => now()->format('H:i')];
            $payload['status'] = 'published';
            $payload['_publication'] = ['event_id' => $eventId, 'actor_id' => $actor->id, 'task_ids' => $taskIds,
                'processed' => false, 'recorded_at' => now()->toIso8601String()];
            $payload['history'] = [...($payload['history'] ?? []), ['id' => $eventId, 'userId' => (string) $actor->id,
                'userName' => $actor->name, 'action' => 'ثبت انتشار در تدبیر', 'fromStatus' => $before,
                'toStatus' => 'published', 'timestamp' => now()->toIso8601String()]];
            $content->update(['status' => 'published', 'payload' => $payload]);
            // Synchronous listener is inside this transaction. A failure rolls back both
            // the source and ALL task changes. Retrying the same command is safe.
            event(new ContentPublished($content->id, $actor->id, $eventId));
            $content->refresh();
            abort_unless($content->payload['_publication']['processed'] ?? false, 500, 'ثبت انتشار کامل نشد؛ دوباره تلاش کنید.');
            ActivityLog::create(['user_id' => $actor->id, 'project_id' => $content->project_id,
                'type' => 'content_published', 'action' => 'ثبت انتشار محتوا در تدبیر',
                'details' => json_encode(['event_id' => $eventId, 'event' => 'content.published', 'content_id' => $content->id,
                    'external_delivery' => false, 'from' => $before, 'to' => 'published'], JSON_UNESCAPED_UNICODE)]);

            return $content;
        }, 3);
    }

    public function unpublish(User $actor, Content $content, string $expected): Content
    {
        $actor = $this->authorize($actor);

        return DB::transaction(function () use ($actor, $content, $expected): Content {
            $content = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(ContentAccess::class)->canView($actor, $content), 403);
            if (! self::published($content)) {
                return $content;
            }
            $this->checkVersion($content, $expected);
            $payload = $content->payload ?? [];
            $payload['publishInfo'] = [...($payload['publishInfo'] ?? []), 'status' => 'ready'];
            $payload['status'] = 'ready_to_publish';
            $payload['history'] = [...($payload['history'] ?? []), ['id' => (string) Str::uuid(), 'userId' => (string) $actor->id,
                'userName' => $actor->name, 'action' => 'لغو ثبت انتشار؛ تسک‌های انجام‌شده حفظ شدند',
                'fromStatus' => $content->status, 'toStatus' => 'ready_to_publish', 'timestamp' => now()->toIso8601String()]];
            $content->update(['status' => 'ready_to_publish', 'payload' => $payload]);
            ActivityLog::create(['user_id' => $actor->id, 'project_id' => $content->project_id, 'type' => 'content_unpublished',
                'action' => 'لغو ثبت انتشار محتوا', 'details' => 'content:'.$content->id.'; completed tasks retained']);

            return $content;
        }, 3);
    }

    public function schedule(User $actor, Content $content, array $data): Content
    {
        $this->authorize($actor);

        return DB::transaction(function () use ($actor, $content, $data): Content {
            $content = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(ContentAccess::class)->canView($actor, $content), 403);
            $this->checkVersion($content, $data['expectedVersion']);
            abort_if(self::published($content), 409, 'برای تغییر برنامه ابتدا ثبت انتشار را لغو کنید.');
            $payload = $content->payload ?? [];
            $publisher = array_key_exists('publisherId', $data) ? $data['publisherId'] : ($payload['publisherId'] ?? null);
            if ($publisher) {
                abort_unless(User::find($publisher)?->isActive(), 422, 'ناشر باید حساب فعال داشته باشد.');
            }
            $payload['publisherId'] = $publisher ? (string) $publisher : null;
            $payload['publishInfo'] = [...($payload['publishInfo'] ?? []), ...($data['publishInfo'] ?? [])];
            $nextStatus = ($payload['publishInfo']['status'] ?? null) === 'ready' ? 'ready_to_publish' : $content->status;
            $payload['status'] = $nextStatus;
            $content->update(['status' => $nextStatus, 'payload' => $payload]);
            ActivityLog::create(['user_id' => $actor->id, 'project_id' => $content->project_id, 'type' => 'content_publication_scheduled',
                'action' => 'ذخیره برنامه انتشار', 'details' => 'content:'.$content->id]);

            return $content;
        }, 3);
    }

    public function createTask(User $actor, Content $content, array $data): Task
    {
        $actor = $this->authorize($actor);
        abort_unless($actor->hasPermission('tasks.create') && $actor->hasPermission('tasks.view'), 403);

        return DB::transaction(function () use ($actor, $content, $data): Task {
            $content = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            abort_unless(app(ContentAccess::class)->canView($actor, $content), 403);
            abort_if(self::published($content), 409, 'انتشار این محتوا قبلاً ثبت شده است.');
            $this->checkVersion($content, $data['expectedVersion']);
            $assignee = (int) ($data['assigneeId'] ?? ($content->payload['publisherId'] ?? $actor->id));
            abort_unless(User::find($assignee)?->isActive(), 422, 'مسئول تسک باید حساب فعال داشته باشد.');
            $existing = Task::where('content_id', $content->id)->where('kind', self::KIND)->whereNotIn('status', ['completed', 'archived'])->orderBy('id')->lockForUpdate()->first();
            if ($existing) {
                abort_unless((int) $existing->assignee_id === $assignee, 409, 'تسک انتشار فعال با مسئول دیگری وجود دارد؛ همان تسک را ویرایش کنید.');

                return $existing;
            }
            $task = Task::create(['title' => $data['title'] ?? mb_substr('انتشار: '.$content->title, 0, 255),
                'description' => $data['description'] ?? 'با ثبت موفق انتشار این محتوا در تدبیر، تسک به‌صورت خودکار تکمیل می‌شود.',
                'kind' => self::KIND, 'content_id' => $content->id, 'project_id' => $content->project_id,
                'assignee_id' => $assignee, 'status' => 'todo', 'priority' => $data['priority'] ?? 'high',
                'deadline' => $data['deadline'] ?? $content->deadline, 'tags' => ['انتشار محتوا']]);
            app(TaskOperations::class)->updateProjectProgress($task->project_id);
            app(TaskAssignmentNotifications::class)->created($task);
            ActivityLog::create(['user_id' => $actor->id, 'task_id' => $task->id, 'project_id' => $task->project_id,
                'type' => 'task_created', 'action' => 'ایجاد تسک مرتبط با انتشار محتوا', 'details' => 'content:'.$content->id]);

            return $task;
        }, 3);
    }

    /** A stale generic autosave may never undo/forge publication or its receipt. */
    public function guardGenericWrite(array $incoming, ?Content $content): void
    {
        if (array_key_exists('_publication', $incoming)) {
            throw ValidationException::withMessages(['_publication' => 'اطلاعات رویداد فقط توسط سرور ثبت می‌شود.']);
        }
        if ($content && array_key_exists('publicationVersion', $incoming)) {
            $this->checkVersion($content, (string) $incoming['publicationVersion']);
        }
        $oldPublished = $content ? self::published($content) : false;
        if ((isset($incoming['status']) && (($incoming['status'] === 'published') !== $oldPublished))
            || (isset($incoming['publishInfo']['status']) && (($incoming['publishInfo']['status'] === 'published') !== $oldPublished))) {
            abort(409, 'برای انتشار یا لغو انتشار از دکمهٔ مربوط استفاده کنید و اطلاعات صفحه را تازه کنید.');
        }
        if ($content && array_key_exists('publishInfo', $incoming) && $incoming['publishInfo'] != ($content->payload['publishInfo'] ?? [])) {
            abort(409, 'برنامهٔ انتشار فقط از مسیر تنظیمات انتشار ذخیره می‌شود.');
        }
        if ($content && array_key_exists('publisherId', $incoming)
            && (string) $incoming['publisherId'] !== (string) ($content->payload['publisherId'] ?? '')) {
            abort(409, 'ناشر فقط از مسیر تنظیمات انتشار تغییر می‌کند.');
        }
    }
}
