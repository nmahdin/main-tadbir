<?php

namespace App\Bot\Bale\Handlers;

use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;

/**
 * دکمه‌های زیرِ پیامِ «وظیفهٔ جدید».
 *
 * پیش‌تر اعلانِ واگذاریِ وظیفهٔ عادی **بی‌دکمه** می‌آمد و کاربر باید خودش
 * وظیفه را در فهرست پیدا می‌کرد؛ اعلانِ وظیفهٔ مرحلهٔ محتوا هم فقط دکمه‌های
 * خروجی/جزئیات را داشت. حالا هر اعلان وظیفه دست‌کم «جزئیات وظیفه» و — اگر
 * وظیفه تکمیل‌شدنی باشد — «تکمیل وظیفه» را دارد و هر دو همان مسیرهای بات را
 * باز می‌کنند (نه نشانیِ بیرونی).
 *
 * هیچ تصمیم تازه‌ای اینجا گرفته نمی‌شود: همان قواعدِ دکمه‌های صفحهٔ جزئیات
 * وظیفه در `MenuRouter` تکرار می‌شود تا ظاهر و رفتار یکی بماند.
 */
final class TaskNotificationButtons
{
    /**
     * @return array<int, array<int, array{text: string, callback_data: string}>>
     */
    public function rows(User $user, DomainRecord $record): array
    {
        $taskId = (int) ($record->payload['linkTaskId'] ?? 0);
        if ($taskId <= 0 || ! $user->hasPermission('tasks.view')) {
            return [];
        }
        $task = Task::whereKey($taskId)->where('assignee_id', $user->id)->first();
        if (! $task) {
            return [];
        }

        $rows = [[['text' => '📌 جزئیات وظیفه', 'callback_data' => 'task:'.$task->id]]];
        // وظیفهٔ عمومیِ متصل به محتوا را جریان محتوا پیش می‌برد؛ تکمیلِ آن از
        // بات همان قاعدهٔ صفحهٔ جزئیات را دارد.
        $completable = ! in_array($task->status, ['completed', 'archived'], true)
            && ! ($task->content_id && in_array($task->kind, [null, 'general'], true));
        if ($completable) {
            $rows[] = [['text' => '✅ تکمیل وظیفه', 'callback_data' => 'done:'.$task->id]];
        }

        return $rows;
    }
}
