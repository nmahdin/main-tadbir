<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PersianDate;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Content;
use App\Models\DamAsset;
use App\Models\DomainRecord;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentPublication;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\Storage;

/**
 * اطلاعات انتشار برای وظیفه‌های متصل به محتوا در بات بله.
 *
 * فقط وظیفه‌ای که واقعاً وظیفهٔ انتشار است (تسک خودکار انتشار یا تسکِ کاریِ
 * مرحله‌ای با کلید «انتشار») این دکمه را می‌گیرد:
 *
 * - «دریافت اطلاعات انتشار»: تاریخ/ساعت انتشار، کانال‌ها، ناشر و متن کپشن؛
 * - فایل‌های خروجی: برای هر خروجی یک دکمه؛ با زدن آن، همان فایل برای کاربر
 *   فرستاده می‌شود (خروجیِ متنی به‌صورت پیام متنی می‌آید)؛
 * - «کپی متن کپشن»: کپشن در یک پیام جدا فرستاده می‌شود تا بتوان آن را کپی کرد.
 *
 * دسترسی همان قاعدهٔ همیشگی وظایف است: فقط مسئول همان وظیفه و با مجوز مشاهدهٔ
 * وظایف؛ هیچ پرونده یا فایلی از محتوای دیگر خوانده نمی‌شود.
 */
final class ContentPublishInfo
{
    /** سقف حجم پروندهٔ قابل ارسال در بات (بایت). */
    private const MAX_FILE_BYTES = 20 * 1024 * 1024;

    /** بیشترین شمار خروجی‌ای که برای آن دکمه ساخته می‌شود. */
    private const MAX_OUTPUT_BUTTONS = 8;

    public function handle(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $action): bool
    {
        if (preg_match('/^pubinfo:(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            $content = $this->publishContent($task);
            abort_unless($content, 404);
            $session?->delete();
            $this->sendInfo($key, $chat, $link, $task, $content);

            return true;
        }
        if (preg_match('/^pubfile:(\d{1,18}):(\d{1,3})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            $content = $this->publishContent($task);
            abort_unless($content, 404);
            $session?->delete();
            $this->sendOutput($key, $chat, $link, $task, $content, (int) $m[2]);

            return true;
        }
        if (preg_match('/^pubcap:(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            $content = $this->publishContent($task);
            abort_unless($content, 404);
            $session?->delete();
            $this->sendCaption($key, $chat, $link, $task, $content);

            return true;
        }

        return false;
    }

    /**
     * دکمه‌های اعلان: فقط برای اعلانی که به وظیفهٔ انتشارِ خودِ کاربر وصل است.
     *
     * @return array<int, array<int, array<string, string>>>
     */
    public function notificationRows(User $user, DomainRecord $record): array
    {
        $taskId = (int) ($record->payload['linkTaskId'] ?? 0);
        if ($taskId <= 0) {
            return [];
        }
        $task = Task::whereKey($taskId)->where('assignee_id', $user->id)->first();
        if (! $task || ! $this->publishContent($task)) {
            return [];
        }

        return [[['text' => '📣 دریافت اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]]];
    }

    /** پروندهٔ محتوا فقط وقتی که این وظیفه واقعاً وظیفهٔ انتشار همان پرونده است. */
    private function publishContent(Task $task): ?Content
    {
        $content = $task->content;
        if (! $content) {
            return null;
        }
        if ($task->kind === ContentPublication::KIND) {
            return $content;
        }
        $stages = collect(is_array($content->payload['stages'] ?? null) ? $content->payload['stages'] : [])
            ->filter(fn ($stage) => is_array($stage));
        $stage = $stages->first(fn (array $stage) => (string) ($stage['id'] ?? '') === (string) $task->content_stage_id);

        return $stage && ($stage['stageKey'] ?? null) === 'publish' ? $content : null;
    }

    /**
     * خروجی‌های ثبت‌شدهٔ همهٔ مراحل، به همان ترتیب ثبت.
     *
     * @return array<int, array{type: string, label: string, asset: ?DamAsset, disk: ?string, path: ?string, name: ?string, text: string}>
     */
    private function outputs(Content $content): array
    {
        $items = [];
        $stages = is_array($content->payload['stages'] ?? null) ? $content->payload['stages'] : [];
        foreach ($stages as $stage) {
            if (! is_array($stage)) {
                continue;
            }
            foreach (($stage['outputs'] ?? []) as $output) {
                if (! is_array($output)) {
                    continue;
                }
                $assetId = is_numeric($output['assetId'] ?? null) ? (int) $output['assetId'] : 0;
                $asset = $assetId > 0 ? DamAsset::with(['latestFile', 'contentItem'])->find($assetId) : null;
                $file = $asset?->latestFile;
                $text = trim((string) ($output['value'] ?? ''));
                if ($text === '' && $asset && $asset->type === 'content') {
                    $text = trim((string) ($asset->contentItem?->content_body ?? ''));
                }
                $label = MessageText::plain((string) ($output['name'] ?? $output['fileName'] ?? ''), 60);
                if ($file) {
                    $items[] = ['type' => 'file', 'label' => $label !== '' ? $label : ($file->original_filename ?: 'فایل خروجی'),
                        'asset' => $asset, 'disk' => $file->storage_disk, 'path' => $file->storage_path,
                        'name' => $file->original_filename ?: 'خروجی', 'text' => $text];
                    continue;
                }
                if ($text !== '') {
                    $items[] = ['type' => 'text', 'label' => $label !== '' ? $label : 'متن خروجی',
                        'asset' => $asset, 'disk' => null, 'path' => null, 'name' => null, 'text' => $text];
                }
            }
        }

        return $items;
    }

    private function sendInfo(string $key, string $chat, BaleUserLink $link, Task $task, Content $content): void
    {
        $payload = is_array($content->payload) ? $content->payload : [];
        $info = is_array($payload['publishInfo'] ?? null) ? $payload['publishInfo'] : [];
        $publisher = is_numeric($payload['publisherId'] ?? null) ? User::find((int) $payload['publisherId']) : null;
        $channels = collect(is_array($info['channels'] ?? null) ? $info['channels'] : [])
            ->filter(fn ($channel) => is_string($channel) && trim($channel) !== '')
            ->map(fn ($channel) => MessageText::plain(trim($channel), 40))->implode('، ');
        $caption = trim((string) ($info['caption'] ?? ''));

        $body = "📣 *اطلاعات انتشار محتوا* \n\n"
            .'📌 '.MessageText::plain((string) $content->title, 180)."\n"
            .'🧩 کد: '.MessageText::plain((string) ($content->code ?? '—'), 60)."\n"
            .'📅 تاریخ انتشار: '.PersianDate::format($info['date'] ?? null)
            .(empty($info['time']) ? '' : ' · ساعت '.MessageText::plain((string) $info['time'], 10))."\n"
            .'📡 کانال‌ها: '.($channels !== '' ? $channels : 'تعیین نشده')."\n"
            .'👤 ناشر: '.MessageText::plain($publisher?->name ?? 'تعیین نشده', 120)."\n"
            .'🏷 وضعیت پرونده: '.MessageText::plain((string) ($content->status ?? '—'), 40);

        $outputs = $this->outputs($content);
        if ($outputs === []) {
            $body .= "\n\nهیچ خروجی‌ای برای این پرونده ثبت نشده است.";
        } else {
            $body .= "\n\nبرای دریافت هر خروجی، دکمهٔ همان خروجی را بزنید.";
        }
        if ($caption !== '') {
            $body .= "\n\n📝 *متن کپشن* \n".MessageText::plain($caption, 1200);
        } else {
            $body .= "\n\nکپشنی برای این پرونده ثبت نشده است.";
        }

        $rows = [];
        foreach (array_slice($outputs, 0, self::MAX_OUTPUT_BUTTONS) as $index => $item) {
            $label = $item['type'] === 'file' ? '📎 '.$item['label'] : '📝 '.$item['label'];
            $rows[] = [['text' => mb_substr($label, 0, 60), 'callback_data' => 'pubfile:'.$task->id.':'.$index]];
        }
        if ($caption !== '') {
            $rows[] = [['text' => '📋 کپی متن کپشن', 'callback_data' => 'pubcap:'.$task->id]];
        }

        $this->reply($key, $chat, $link, $body, $rows, $task->id);
    }

    private function sendOutput(string $key, string $chat, BaleUserLink $link, Task $task, Content $content, int $index): void
    {
        $outputs = $this->outputs($content);
        $item = $outputs[$index] ?? null;
        if (! $item) {
            $this->reply($key, $chat, $link, 'این خروجی دیگر در دسترس نیست؛ دکمهٔ «دریافت اطلاعات انتشار» را دوباره بزنید.', [[['text' => '📣 دریافت اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]]], $task->id);

            return;
        }
        if ($item['type'] === 'file') {
            $size = $item['disk'] && $item['path'] ? (int) Storage::disk($item['disk'])->size($item['path']) : 0;
            if ($size <= 0 || $size > self::MAX_FILE_BYTES) {
                $this->reply($key, $chat, $link, 'حجم این خروجی برای ارسال در بات مناسب نیست؛ آن را از پنل تدبیر دریافت کنید.', [[['text' => '📣 دریافت اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]]], $task->id);

                return;
            }
            $item['asset']?->activities()->create(['actor_id' => $user->id, 'action' => 'bale_sent',
                'metadata' => ['task_id' => $task->id, 'content_id' => $content->id, 'source' => 'publish_info']]);
            app(Outbox::class)->enqueue($key, $chat, [
                '_method' => 'sendDocument',
                '_file_disk' => (string) $item['disk'],
                '_file_path' => (string) $item['path'],
                '_file_name' => (string) $item['name'],
                'caption' => mb_substr('خروجی انتشار: '.$content->title, 0, 900),
            ], $link, 'task', $task->id);

            return;
        }
        $body = "📝 *خروجی متنی انتشار* \n\n".MessageText::plain((string) $item['text'], 2800);
        $this->reply($key, $chat, $link, $body, [[['text' => '📣 دریافت اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]]], $task->id);
    }

    private function sendCaption(string $key, string $chat, BaleUserLink $link, Task $task, Content $content): void
    {
        $payload = is_array($content->payload) ? $content->payload : [];
        $info = is_array($payload['publishInfo'] ?? null) ? $payload['publishInfo'] : [];
        $caption = trim((string) ($info['caption'] ?? ''));
        if ($caption === '') {
            $this->reply($key, $chat, $link, 'کپشنی برای این پرونده ثبت نشده است.', [[['text' => '📣 دریافت اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]]], $task->id);

            return;
        }
        // متن در یک بلوک تک‌فاصله فرستاده می‌شود تا با لمسِ طولانی قابل کپی باشد.
        $safe = str_replace(['[', ']', '(', ')', '*', '_', '`'], ['［', '］', '（', '）', '＊', '＿', 'ˋ'], mb_substr($caption, 0, 3000));
        $body = "برای کپی، متن را لمسِ طولانی کنید و «کپی» را بزنید.\n\n```\n".$safe."\n```";
        $this->reply($key, $chat, $link, $body, [[['text' => '📣 دریافت اطلاعات انتشار', 'callback_data' => 'pubinfo:'.$task->id]]], $task->id);
    }

    /**
     * @param  array<int, array<int, array<string, string>>>  $rows
     */
    private function reply(string $key, string $chat, BaleUserLink $link, string $text, array $rows, int $taskId): void
    {
        $rows[] = [['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$taskId]];
        app(Outbox::class)->enqueue($key, $chat, [
            'text' => $text,
            'reply_markup' => ['inline_keyboard' => [...$rows, ...MenuNavigation::rows($link)]],
        ], $link, 'task', $taskId);
    }
}
