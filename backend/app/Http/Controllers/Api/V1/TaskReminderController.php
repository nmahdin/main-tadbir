<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Services\TaskReminders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * یادآوری وظیفه از داشبورد دپارتمان: یک دکمه، دو مقصد.
 *
 * اعلان در سامانه ثبت می‌شود و اگر مسئول اجرا ربات بله را وصل کرده باشد همان
 * اعلان از مسیر موجود به بله هم می‌رود؛ هیچ کانال دومی ساخته نمی‌شود.
 */
final class TaskReminderController extends Controller
{
    public function __invoke(Request $request, Task $task, TaskReminders $reminders): JsonResponse
    {
        $actor = $request->user();

        if (! $actor) {
            return response()->json(['message' => 'ابتدا وارد سامانه شوید.'], 401);
        }

        $result = $reminders->send($task, $actor);

        if ($result['throttled']) {
            return response()->json(['data' => $result, 'message' => $result['reason']], 429);
        }

        if (! $result['sent']) {
            return response()->json(['message' => $result['reason'] ?? 'یادآوری ارسال نشد.'], 422);
        }

        return response()->json([
            'data' => $result,
            'message' => $result['bale_linked']
                ? 'یادآوری برای مسئول اجرا در سامانه ثبت شد و در بله هم ارسال می‌شود.'
                : 'یادآوری در سامانه ثبت شد. حساب بله مسئول اجرا متصل نیست، پس پیام بله ارسال نمی‌شود.',
        ]);
    }
}
