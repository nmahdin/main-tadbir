<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Task;
use App\Models\User;
use App\Services\DamService;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/** No public uploads and no guessed Bale file-download API: files use the authenticated panel. */
final class TaskAssets
{
    public function handle(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $action, ?string $text): bool
    {
        $textAsset = str_starts_with($action, 'assettext:') || str_starts_with($action, 'asseturl:') || (str_starts_with($session?->step ?? '', 'text_asset_') && ($text !== null || str_starts_with($action, 'confirm:')));
        $send = function (string $body, int $taskId, array $rows = []) use ($key, $chat, $link, $textAsset) {
            $rows[] = [['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$taskId], ['text' => 'لغو', 'callback_data' => 'cancel']];
            app(Outbox::class)->enqueue($key, $chat, ['_asset_text' => $textAsset, 'text' => $body, 'reply_markup' => ['inline_keyboard' => [...$rows, ...app(PanelLinks::class)->buttons('task', $taskId)]]], $link, 'task', $taskId);
        };
        if (preg_match('/^taskasset:(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            abort_unless($user->hasPermission('assets.view'), 403);
            $session?->delete();
            $rows = [];
            if ($user->hasPermission('assets.upload')) {
                $rows[] = [['text' => '📝 ثبت متن در بات', 'callback_data' => 'assettext:'.$task->id], ['text' => '🔗 ثبت لینک مرجع', 'callback_data' => 'asseturl:'.$task->id]];
                if ($url = app(PanelLinks::class)->assetUrl($task->id, 'file')) {
                    $rows[] = [['text' => '📎 ثبت فایل در فرم امن', 'url' => $url]];
                }
            }
            $rows[] = [['text' => '📊 ثبت ردیف جدول در بات', 'callback_data' => 'assetrows:'.$task->id]];
            if ($url = app(PanelLinks::class)->assetUrl($task->id)) {
                $rows[] = [['text' => '🔗 فرم مستقیم ثبت دارایی', 'url' => $url]];
            }
            $send('📎 *دارایی‌های تسک* '."\n".MessageText::plain($task->title, 180)."\n\nمتن یا ردیف جدول را همین‌جا ثبت کنید. برای فایل، فرم سایت با ورود به حساب باز می‌شود. تمام موارد به همین تسک متصل می‌شوند.", $task->id, $rows);
        } elseif (preg_match('/^asset(text|url):(\d{1,18})$/', $action, $m)) {
            $task = $this->task($user, $m[2]);
            BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => 'text_asset_title', 'nonce' => bin2hex(random_bytes(12)), 'data' => ['task_id' => $task->id, 'mode' => $m[1] === 'url' ? 'url' : 'text'], 'expires_at' => now()->addMinutes(10)]);
            $send('📝 عنوان دارایی را بنویسید (حداکثر ۲۵۵ نویسه).', $task->id);
        } elseif ($text !== null && in_array($session?->step, ['text_asset_title', 'text_asset_body'], true)) {
            $task = $this->task($user, $session->data['task_id']);
            $title = $session->step === 'text_asset_title';
            Validator::make(['value' => $text], ['value' => 'required|string|max:'.($title ? '255' : '3000')])->validate();
            if (! $title && ($session->data['mode'] ?? 'text') === 'url') {
                $this->validateUrl($text);
            }
            $session->update(['step' => $title ? 'text_asset_body' : 'text_asset_confirm', 'data' => [...$session->data, $title ? 'title' : 'body' => $text]]);
            $send($title ? (($session->data['mode'] ?? 'text') === 'url' ? 'لینک HTTPS را بفرستید. نشانی به‌صورت دارایی متنی ذخیره می‌شود؛ فایل از اینترنت دانلود نمی‌شود. لینک حاوی رمز یا اطلاعات محرمانهٔ دیگر نفرستید.' : 'متن دارایی را بنویسید (حداکثر ۳۰۰۰ نویسه). ثبت فقط پس از تأیید شما انجام می‌شود.') : '📝 *پیش‌نمایش دارایی* '."\n\n".MessageText::plain($session->data['title'], 255)."\n".MessageText::plain($text, 3000)."\n\n📌 تسک: ".MessageText::plain($task->title, 180)."\n🔒 محرمانه — مالک و مدیر؛ تغییر دسترسی از مخزن دارایی در پنل.", $task->id, $title ? [] : [[['text' => '✅ تأیید ثبت دارایی', 'callback_data' => 'confirm:'.$session->nonce]]]);
        } elseif ($session?->step === 'text_asset_confirm' && preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            $asset = DB::transaction(function () use ($user, $data) {
                // Lock and re-check assignment/permissions at commit, not just on the opening button.
                Task::whereKey($data['task_id'])->lockForUpdate()->first();
                $actor = $user->fresh();
                abort_unless($actor, 403);
                $task = $this->task($actor, $data['task_id']);
                $validated = Validator::make($data, ['title' => 'required|string|max:255', 'body' => 'required|string|max:3000'])->validate();
                if (($data['mode'] ?? 'text') === 'url') {
                    $this->validateUrl($validated['body']);
                    $validated['description'] = 'لینک مرجع؛ بدون دریافت فایل از نشانی';
                }
                $asset = app(DamService::class)->create([...$validated, 'task_id' => $task->id, 'status' => 'draft', 'confidentiality' => 'confidential', 'department_id' => $actor->department_id], $actor);
                $asset->activities()->create(['actor_id' => $actor->id, 'action' => 'bale_created', 'metadata' => ['task_id' => $task->id]]);

                return $asset;
            });
            $session->delete();
            $send('✅ دارایی شماره '.$asset->id.' ثبت و به تسک متصل شد.', $data['task_id']);
        } else {
            return false;
        }

        return true;
    }

    private function validateUrl(string $value): void
    {
        Validator::make(['url' => $value], ['url' => 'required|url:https|max:2000'])->validate();
        $parts = parse_url($value);
        Validator::make(['credentials' => isset($parts['user']) || isset($parts['pass'])], ['credentials' => 'declined'])->validate();
    }

    private function task(User $user, int|string $id): Task
    {
        $user = $user->fresh();
        abort_unless($user?->isActive() && $user->hasPermission('assets.view') && $user->hasPermission('assets.upload'), 403);

        return app(TaskOperations::class)->ownForBale($user, $id);
    }
}
