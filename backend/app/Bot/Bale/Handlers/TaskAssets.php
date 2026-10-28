<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\AssetFolders;
use App\Bot\Bale\Support\IncomingFile;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\DamFolder;
use App\Models\Task;
use App\Models\User;
use App\Services\Access\UserPermissionGate;
use App\Services\DamService;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * ثبت دارایی از بات: متن در همین گفتگو، پرونده یا از راهِ فرمِ امنِ مینی‌اپ و
 * یا با فرستادنِ مستقیمِ فایل در خودِ بات.
 *
 * پروندهٔ فرستاده‌شده در بات همان مسیرِ مخزن را می‌رود (`DamService`)؛ هیچ
 * ذخیره‌سازیِ جداگانه‌ای برای فایل‌های بات ساخته نمی‌شود و ثبت همیشه با
 * تأییدِ صریحِ کاربر انجام می‌شود.
 */
final class TaskAssets
{
    public function handle(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $action, ?string $text): bool
    {
        $send = $this->sender($key, $chat, $link);
        if ($action === 'assets' || preg_match('/^taskasset:(\d{1,18})$/', $action, $m)) {
            // ثبت دارایی با هر یک از مجوزهای مخزن در دسترس است؛ سطحِ دقیق برای
            // هر روش (فایل، متن، جدول) همان‌جا سنجیده می‌شود.
            app(UserPermissionGate::class)->authorizeAny($user, ['assets.view', 'assets.upload', 'assets.edit_info']);
            $task = $action === 'assets' ? null : app(TaskOperations::class)->ownForBale($user, $m[1]);
            $session?->delete();
            $id = $task?->id ?? 0;
            $rows = [];
            if (app(UserPermissionGate::class)->any($user, 'assets.upload')) {
                $rows[] = [['text' => '📤 فرستادن فایل در همین بات', 'callback_data' => 'assetsend:'.$id]];
                $rows[] = [['text' => '📎 فرم بارگذاری امن', 'callback_data' => 'assetfile:'.$id]];
                $rows[] = [['text' => '📝 ثبت متن', 'callback_data' => 'assettext:'.$id]];
            }
            $rows[] = [['text' => '📊 اطلاعات جدول', 'callback_data' => $id ? 'assetrows:'.$id : 'assetrows']];
            $send('📎 *ثبت دارایی* '.($task ? "\n📌 ".MessageText::plain($task->title, 180) : '')."\n\nانتخاب کنید: فایل را همین‌جا در بات بفرستید، فرم بارگذاریِ مینی‌اپ را باز کنید، متن بنویسید یا اطلاعات جدول ثبت کنید.", $id, $rows);
        } elseif (preg_match('/^assetfile:(\d{1,18})$/', $action, $m)) {
            $task = $this->authorize($user, (int) $m[1]);
            $session?->delete();
            $buttons = app(PanelLinks::class)->assetButtons($link, $task?->id ?? 0, 'file');
            $send($buttons ? '📎 فرم بارگذاری امن در مینی‌اپ تدبیر باز می‌شود. ورود مستقیم و یک‌بارمصرف است؛ سپس فایل را انتخاب، مشخصات را تکمیل و ثبت کنید. اگر همین‌جا راحت‌تر است، پرونده را در همین گفتگو بفرستید.' : 'نشانی فرم امن تنظیم نشده است؛ پرونده را مستقیم در همین گفتگو بفرستید یا با مدیر تماس بگیرید.', $task?->id ?? 0, $buttons);
        } elseif (preg_match('/^assetsend:(\d{1,18})$/', $action, $m)) {
            $task = $this->authorize($user, (int) $m[1]);
            BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => 'asset_file', 'nonce' => bin2hex(random_bytes(12)),
                'data' => ['task_id' => $task?->id], 'expires_at' => now()->addMinutes(10)]);
            $send('📤 پرونده را همین‌جا در گفتگو بفرستید (تا '.MessageText::plain((string) intdiv(IncomingFile::MAX_BYTES, 1024 * 1024), 3)
                .' مگابایت). پس از دریافت، عنوان و پوشهٔ مقصد را می‌پرسم و فقط با تأیید شما در مخزن ثبت می‌شود.', $task?->id ?? 0, sensitive: true);
        } elseif ($text !== null && $session?->step === 'asset_file_title') {
            $data = $session->data;
            $task = $this->authorize($user, (int) ($data['task_id'] ?? 0));
            $title = trim($text) === '-' ? ($data['file_name'] ?? 'پرونده') : trim($text);
            Validator::make(['title' => $title], ['title' => 'required|string|max:255'])->validate();
            $session->update(['step' => 'asset_file_confirm', 'data' => [...$data, 'title' => $title]]);
            $preview = $session->data + ['title' => $title];
            $send($this->assetPreview('asset_file_confirm', $preview, $task),
                $task?->id ?? 0, $this->assetConfirmRows($session, $preview), true);
        } elseif (in_array($session?->step, ['asset_file_confirm', 'text_asset_confirm'], true)
            && preg_match('/^asset(dir|use):([a-f0-9]{24}):(\d{1,18})(?::(\d{1,3}))?$/', $action, $m)) {
            // انتخاب پوشهٔ مقصد پیش از تأیید نهایی؛ همان درختِ پوشه‌های مخزن.
            abort_unless(hash_equals($session->nonce, $m[2]), 409);
            $folders = app(AssetFolders::class);
            $folderId = (int) $m[3];
            $task = $this->authorize($user, (int) ($session->data['task_id'] ?? 0));
            if ($m[1] === 'use') {
                abort_unless($folderId === 0 || DamFolder::query()->whereKey($folderId)->exists(), 404);
                $session->update(['data' => [...$session->data, 'folder_id' => $folderId > 0 ? $folderId : null]]);
                $data = $session->data;
                $send($this->assetPreview((string) $session->step, $data, $task),
                    $task?->id ?? 0, $this->assetConfirmRows($session, $data), true);
            } else {
                $page = (int) ($m[4] ?? 0);
                $send($folders->text($session->nonce, $folderId, $page),
                    $task?->id ?? 0, $folders->rows($session->nonce, $folderId, $page), true);
            }
        } elseif ($session?->step === 'asset_file_confirm' && preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            $session->delete();
            $asset = DB::transaction(function () use ($user, $data) {
                if ($data['task_id'] ?? null) {
                    Task::whereKey($data['task_id'])->lockForUpdate()->first();
                }
                $actor = $user->fresh();
                abort_unless($actor, 403);
                $task = $this->authorize($actor, (int) ($data['task_id'] ?? 0));
                $files = app(IncomingFile::class);
                $upload = is_array($data['file'] ?? null) ? $files->upload($data['file']) : null;
                abort_unless($upload, 409, 'پروندهٔ دریافت‌شده دیگر در دسترس نیست؛ دوباره بفرستید.');
                try {
                    $asset = app(DamService::class)->create(['title' => (string) $data['title'], 'task_id' => $task?->id,
                        'description' => 'پروندهٔ دریافت‌شده از بات بله', 'status' => 'draft', 'confidentiality' => 'confidential',
                        'folder_id' => isset($data['folder_id']) && (int) $data['folder_id'] > 0 ? (int) $data['folder_id'] : null,
                        'department_id' => $actor->department_id], $actor, $upload);
                    $asset->activities()->create(['actor_id' => $actor->id, 'action' => 'bale_created',
                        'metadata' => ['task_id' => $task?->id, 'source' => 'chat_file']]);

                    return $asset;
                } finally {
                    $files->discard($data['file'] ?? null);
                }
            });
            $send('✅ دارایی شماره '.$asset->id.' ثبت شد.'.(($data['task_id'] ?? null) ? ' به تسک متصل شد.' : ''), (int) ($data['task_id'] ?? 0), sensitive: true);
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
                : $this->assetPreview('text_asset_confirm', $session->data, $task);
            $send($body, $task?->id ?? 0, $title ? [] : $this->assetConfirmRows($session, $session->data), true);
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
                $asset = app(DamService::class)->create([...$validated, 'task_id' => $task?->id, 'status' => 'draft', 'confidentiality' => 'confidential',
                    'folder_id' => isset($data['folder_id']) && (int) $data['folder_id'] > 0 ? (int) $data['folder_id'] : null,
                    'department_id' => $actor->department_id], $actor);
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

    /** پیش‌نمایش قابل‌تأییدِ دارایی (فایل یا متن) همراه با پوشهٔ مقصدِ انتخاب‌شده. */
    private function assetPreview(string $step, array $data, ?Task $task): string
    {
        $title = MessageText::plain((string) ($data['title'] ?? ''), 255);
        $body = $step === 'asset_file_confirm'
            ? MessageText::plain((string) ($data['file_name'] ?? ''), 200)
            : MessageText::plain((string) ($data['body'] ?? ''), 3000);

        return ($step === 'asset_file_confirm' ? '📎 *پیش‌نمایش دارایی* ' : '📝 *پیش‌نمایش دارایی* ')."\n\n".$title."\n".$body
            .($task ? "\n📌 تسک: ".MessageText::plain($task->title, 180) : '')
            .$this->assetFolderLine($data)
            ."\n🔒 ذخیرهٔ محرمانه در مخزن دارایی؛ مدیریت دسترسی از سامانه.";
    }

    /** خطِ پوشهٔ مقصد؛ انتخابِ خالی همان پوشهٔ پیش‌فرض سامانه است. */
    private function assetFolderLine(array $data): string
    {
        $folderId = isset($data['folder_id']) && is_numeric($data['folder_id']) ? (int) $data['folder_id'] : 0;
        $label = $folderId > 0
            ? app(AssetFolders::class)->label($folderId)
            : 'پیش‌فرض سامانه (ریشهٔ مخزن یا پوشهٔ همین تسک)';

        return "\n📁 پوشهٔ مقصد: ".MessageText::plain($label, 300);
    }

    /** دکمه‌های تأیید + انتخاب پوشهٔ مقصد (قابل تغییر تا لحظهٔ ثبت). */
    private function assetConfirmRows(BaleConversation $session, array $data): array
    {
        $folderId = isset($data['folder_id']) && is_numeric($data['folder_id']) ? (int) $data['folder_id'] : 0;
        $label = $folderId > 0 ? app(AssetFolders::class)->label($folderId) : 'پوشهٔ پیش‌فرض';
        $short = mb_strlen($label) > 32 ? '…'.mb_substr($label, -31) : $label;

        return [
            [['text' => '✅ تأیید ثبت دارایی', 'callback_data' => 'confirm:'.$session->nonce]],
            [['text' => '📁 پوشهٔ مقصد: '.$short, 'callback_data' => AssetFolders::browse($session->nonce, $folderId)]],
        ];
    }

    /** فرستندهٔ یکسانِ پیام‌های این بخش؛ فقط برای همین کلاس. */
    private function sender(string $key, string $chat, BaleUserLink $link): \Closure
    {
        return function (string $body, int $taskId = 0, array $rows = [], bool $sensitive = false) use ($key, $chat, $link): void {
            if ($taskId) {
                $rows[] = [['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$taskId]];
            }
            app(Outbox::class)->enqueue($key, $chat, ['_asset_text' => $sensitive, 'text' => $body,
                'reply_markup' => ['inline_keyboard' => [...$rows, ...MenuNavigation::rows($link)]]], $link, $taskId ? 'task' : null, $taskId ?: null);
        };
    }

    /**
     * پرونده‌ای که کاربر در خودِ گفتگو فرستاده است.
     *
     * فقط وقتی پذیرفته می‌شود که فرمِ «فرستادن فایل» باز باشد (`asset_file`)؛
     * پرونده همان‌جا موقتاً نگه داشته می‌شود تا کاربر عنوان را تأیید کند.
     *
     * @param  array{file_id: string, name: string, size: int}  $file
     */
    public function receiveFile(string $key, string $chat, BaleUserLink $link, User $user, BaleConversation $session, array $file): bool
    {
        if ($session->step !== 'asset_file') {
            return false;
        }
        $send = $this->sender($key, $chat, $link);
        $taskId = (int) ($session->data['task_id'] ?? 0);
        $this->authorize($user, $taskId);
        $files = app(IncomingFile::class);
        if ($file['size'] > IncomingFile::MAX_BYTES) {
            $send($files->tooLargeText(), $taskId, sensitive: true);

            return true;
        }
        $stored = $files->store($file);
        if (! $stored) {
            // دلیلِ واقعیِ شکست (مجوز، تغییرمسیر، شبکه، حجم، فایل ناقص) نمایش داده می‌شود.
            $send('❌ دریافت این پرونده از بله ناموفق بود: '.$files->failureText(), $taskId, sensitive: true);

            return true;
        }
        $files->discard($session->data['file'] ?? null);
        $session->update(['step' => 'asset_file_title', 'nonce' => bin2hex(random_bytes(12)),
            'data' => [...$session->data, 'file' => $stored, 'file_name' => $stored['name']]]);
        $send('📎 پرونده دریافت شد: '.MessageText::plain($stored['name'], 200).' ('.MessageText::plain((string) max(1, intdiv($stored['size'], 1024)), 8)
            .' کیلوبایت)'."\n\n".'عنوان دارایی را بنویسید؛ اگر همان نام پرونده کافی است، فقط «-» بفرستید.', $taskId, sensitive: true);

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
        $task = $id ? app(TaskOperations::class)->ownForBale($user, $id) : null;
        // وظیفه‌های متصل به پروندهٔ محتوا بخشِ پیوست ندارند: داراییِ آن‌ها همان
        // خروجیِ مرحله است و از دکمهٔ «ثبت خروجی محتوا» ثبت می‌شود.
        abort_if($task && $task->content_id, 403, 'برای وظیفه‌های متصل به محتوا، دارایی از بخش «ثبت خروجی محتوا» ثبت می‌شود.');

        return $task;
    }
}
