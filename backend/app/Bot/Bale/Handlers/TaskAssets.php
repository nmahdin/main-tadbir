<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Task;
use App\Models\User;
use App\Services\Access\UserPermissionGate;
use App\Services\DamService;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/** Files use the existing authenticated upload form, never an invented Bale getFile API. */
final class TaskAssets
{
    public function handle(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $action, ?string $text): bool
    {
        $send = function (string $body, int $taskId = 0, array $rows = [], bool $sensitive = false) use ($key, $chat, $link): void {
            if ($taskId) {
                $rows[] = [['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$taskId]];
            }
            app(Outbox::class)->enqueue($key, $chat, ['_asset_text' => $sensitive, 'text' => $body,
                'reply_markup' => ['inline_keyboard' => [...$rows, ...MenuNavigation::rows($link)]]], $link, $taskId ? 'task' : null, $taskId ?: null);
        };
        if ($action === 'assets' || preg_match('/^taskasset:(\d{1,18})$/', $action, $m)) {
            app(UserPermissionGate::class)->authorizeAny($user, 'assets.view');
            $task = $action === 'assets' ? null : app(TaskOperations::class)->ownForBale($user, $m[1]);
            $session?->delete();
            $id = $task?->id ?? 0;
            $rows = [];
            if (app(UserPermissionGate::class)->any($user, 'assets.upload')) {
                $rows[] = [['text' => '📎 ثبت فایل', 'callback_data' => 'assetfile:'.$id]];
                $rows[] = [['text' => '📝 ثبت متن', 'callback_data' => 'assettext:'.$id]];
            }
            $rows[] = [['text' => '📊 اطلاعات جدول', 'callback_data' => $id ? 'assetrows:'.$id : 'assetrows']];
            $send('📎 *ثبت دارایی* '.($task ? "\n📌 ".MessageText::plain($task->title, 180) : '')."\n\nنوع دارایی را انتخاب کنید. فایل در فرم امن سایت بارگذاری می‌شود؛ متن و اطلاعات جدول در همین بات ثبت می‌شوند.", $id, $rows);
        } elseif (preg_match('/^assetfile:(\d{1,18})$/', $action, $m)) {
            $task = $this->authorize($user, (int) $m[1]);
            $session?->delete();
            $buttons = app(PanelLinks::class)->assetButtons($link, $task?->id ?? 0, 'file');
            $send($buttons ? '📎 برای ثبت فایل، فرم بارگذاری امن را باز کنید. ورود مستقیم و یک‌بارمصرف است؛ سپس فایل را انتخاب، مشخصات را تکمیل و ثبت کنید. ارسال فایل داخل چت بله در این نسخه پشتیبانی نمی‌شود.' : 'نشانی فرم امن تنظیم نشده است؛ با مدیر تماس بگیرید.', $task?->id ?? 0, $buttons);
        } elseif (preg_match('/^asset(text|url):(\d{1,18})$/', $action, $m)) {
            $task = $this->authorize($user, (int) $m[2]);
            BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => 'text_asset_title', 'nonce' => bin2hex(random_bytes(12)),
                'data' => ['task_id' => $task?->id, 'mode' => $m[1] === 'url' ? 'url' : 'text'], 'expires_at' => now()->addMinutes(10)]);
            $send('📝 عنوان دارایی را بنویسید (حداکثر ۲۵۵ نویسه).', $task?->id ?? 0, sensitive: true);
        } elseif ($text !== null && in_array($session?->step, ['text_asset_title', 'text_asset_body'], true)) {
            $task = $this->authorize($user, (int) ($session->data['task_id'] ?? 0));
            $title = $session->step === 'text_asset_title';
            Validator::make(['value' => $text], ['value' => 'required|string|max:'.($title ? '255' : '3000')])->validate();
            if (! $title && ($session->data['mode'] ?? 'text') === 'url') {
                $this->validateUrl($text);
            }
            $session->update(['step' => $title ? 'text_asset_body' : 'text_asset_confirm', 'data' => [...$session->data, $title ? 'title' : 'body' => $text]]);
            $body = $title
                ? (($session->data['mode'] ?? 'text') === 'url' ? 'لینک HTTPS بدون رمز را بفرستید؛ نشانی به‌صورت متن ذخیره می‌شود و فایل دانلود نمی‌شود.' : 'متن دارایی را بنویسید (حداکثر ۳۰۰۰ نویسه). ثبت فقط پس از تأیید شما انجام می‌شود.')
                : '📝 *پیش‌نمایش دارایی* '."\n\n".MessageText::plain($session->data['title'], 255)."\n".MessageText::plain($text, 3000)
                    .($task ? "\n📌 تسک: ".MessageText::plain($task->title, 180) : '')."\n🔒 ذخیرهٔ محرمانه در مخزن دارایی؛ مدیریت دسترسی از سامانه.";
            $send($body, $task?->id ?? 0, $title ? [] : [[['text' => '✅ تأیید ثبت دارایی', 'callback_data' => 'confirm:'.$session->nonce]]], true);
        } elseif ($session?->step === 'text_asset_confirm' && preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            $asset = DB::transaction(function () use ($user, $data) {
                if ($data['task_id'] ?? null) {
                    Task::whereKey($data['task_id'])->lockForUpdate()->first();
                }
                $actor = $user->fresh();
                abort_unless($actor, 403);
                $task = $this->authorize($actor, (int) ($data['task_id'] ?? 0));
                $validated = Validator::make($data, ['title' => 'required|string|max:255', 'body' => 'required|string|max:3000'])->validate();
                if (($data['mode'] ?? 'text') === 'url') {
                    $this->validateUrl($validated['body']);
                    $validated['description'] = 'لینک مرجع؛ بدون دریافت فایل از نشانی';
                }
                $asset = app(DamService::class)->create([...$validated, 'task_id' => $task?->id, 'status' => 'draft', 'confidentiality' => 'confidential', 'department_id' => $actor->department_id], $actor);
                $asset->activities()->create(['actor_id' => $actor->id, 'action' => 'bale_created', 'metadata' => ['task_id' => $task?->id]]);

                return $asset;
            });
            $session->delete();
            $send('✅ دارایی شماره '.$asset->id.' ثبت شد.'.(($data['task_id'] ?? null) ? ' به تسک متصل شد.' : ''), (int) ($data['task_id'] ?? 0), sensitive: true);
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

    private function authorize(User $user, int $id): ?Task
    {
        $user = $user->fresh();
        abort_unless($user && app(UserPermissionGate::class)->all($user, ['assets.view', 'assets.upload']), 403);

        return $id ? app(TaskOperations::class)->ownForBale($user, $id) : null;
    }
}
