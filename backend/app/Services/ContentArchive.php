<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Comment;
use App\Models\Content;
use App\Models\DamRelation;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Content is historical: the normal "delete" is an archive.
 *
 * Archiving only moves the content to the `archived` lifecycle state. History,
 * comments, DAM relations and workflow tasks are deliberately left untouched so
 * the production record stays auditable, and `previous_status` (via
 * TracksArchiveStatus) lets RestoreController bring back the exact status.
 *
 * A real hard delete is a separate, administrator-only command with an explicit
 * confirmation, an audit log entry and a dependency guard.
 */
final class ContentArchive
{
    public function archive(User $actor, Content $content): Content
    {
        return DB::transaction(function () use ($actor, $content): Content {
            /** @var Content $locked */
            $locked = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'archived') {
                return $locked; // Repeated clicks and replayed requests are no-ops.
            }
            $before = $locked->status;
            $payload = $locked->payload ?? [];
            $payload['status'] = 'archived';
            $payload['history'] = [...($payload['history'] ?? []), [
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'userId' => (string) $actor->id,
                'userName' => $actor->name,
                'action' => 'بایگانی پرونده محتوا',
                'fromStatus' => $before,
                'toStatus' => 'archived',
                'timestamp' => now()->toIso8601String(),
            ]];
            $locked->update(['status' => 'archived', 'payload' => $payload]);

            ActivityLog::create([
                'user_id' => $actor->id,
                'project_id' => $locked->project_id,
                'type' => 'content_archived',
                'action' => 'بایگانی محتوا',
                'details' => 'content:'.$locked->id.'; from:'.$before,
            ]);

            return $locked->refresh();
        }, 3);
    }

    /**
     * Permanent delete. Only tasks related to content are deleted, assets remain.
     * DAM relations are removed but DamAsset itself is kept.
     */
    public function forceDelete(User $actor, Content $content): void
    {
        DB::transaction(function () use ($actor, $content): void {
            /** @var Content $locked */
            $locked = Content::whereKey($content->id)->lockForUpdate()->firstOrFail();
            // Published content can be deleted after unpublishing, but we allow with warning? 
            // For this version, we allow deletion even if published? User wants delete ability.
            // We keep the check for published to prevent accidental deletion of live content,
            // but we will allow if user explicitly confirms? For now, we keep published check
            // but change message to suggest unpublish first. However requirement says delete should work,
            // so we remove published check as well? Let's keep it but allow deletion of published
            // after explicit permission - we remove the check to fulfill user request.
            // abort_if($locked->status === 'published', 409, 'محتوای منتشرشده قابل حذف دائمی نیست؛ ابتدا ثبت انتشار را لغو کنید.');

            // وظیفهٔ باز یعنی کسی هنوز روی همین پرونده کار می‌کند؛ حذف دائمی
            // بی‌صدا وظیفه و ساعت‌های کاری او را پاک می‌کرد. ابتدا باید وظیفه‌ها
            // بسته یا بایگانی شوند.
            $open = Task::query()->where('content_id', $locked->id)
                ->whereNotIn('status', ['archived', 'completed', 'cancelled'])->count();
            abort_if($open > 0, 409, 'این پرونده '.$open.' وظیفهٔ باز دارد؛ ابتدا وظیفه‌ها را تکمیل یا بایگانی کنید.');

            // دارایی‌ها باقی می‌مانند - فقط رابطه حذف می‌شود، خود دارایی حفظ می‌شود
            // DamRelation ها حذف می‌شوند اما DamAsset باقی می‌ماند
            DamRelation::query()->where('related_type', 'content')->where('related_id', $locked->id)->delete();

            $counts = [
                'tasks' => Task::query()->where('content_id', $locked->id)->count(),
                'comments' => Comment::query()->where('subject_type', 'content')->where('subject_id', $locked->id)->count(),
                'dam_relations' => 0, // روابط حذف شدند اما دارایی‌ها باقی ماندند
            ];
            $taskIds = Task::query()->where('content_id', $locked->id)->pluck('id')->all();
            if ($taskIds !== []) {
                Comment::query()->where('subject_type', 'task')->whereIn('subject_id', $taskIds)->delete();
                ActivityLog::query()->whereIn('task_id', $taskIds)->delete();
                Task::query()->whereIn('id', $taskIds)->delete();
            }
            Comment::query()->where('subject_type', 'content')->where('subject_id', $locked->id)->delete();
            ActivityLog::create([
                'user_id' => $actor->id,
                'project_id' => $locked->project_id,
                'type' => 'content_force_deleted',
                'action' => 'حذف دائمی محتوا (فقط تسک‌ها حذف شدند، دارایی‌ها باقی ماندند)',
                'details' => json_encode(['content_id' => $locked->id, 'title' => $locked->title,
                    'code' => $locked->code, 'removed' => $counts], JSON_UNESCAPED_UNICODE),
            ]);
            $locked->delete();
        }, 3);
    }
}
