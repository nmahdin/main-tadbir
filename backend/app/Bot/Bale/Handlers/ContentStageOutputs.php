<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\IncomingFile;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\ActivityLog;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\Content;
use App\Models\Task;
use App\Models\User;
use App\Services\ContentAssetRelations;
use App\Services\ContentStageTaskSync;
use App\Services\DamService;
use App\Services\TaskOperations;
use App\Support\Dam\DamRelationRole;
use App\Support\OrganizationTime;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * ثبت خروجیِ مرحلهٔ محتوا از بات بله.
 *
 * وظیفه‌ای که به یک مرحله از جریان محتوا وصل است می‌تواند خروجی‌اش را همان‌جا
 * تحویل بدهد: متنِ خروجی در گفتگو نوشته می‌شود یا پرونده مستقیماً در بات
 * فرستاده می‌شود. ثبتِ نهایی همان مسیرِ پنل است (`ContentAssetRelations` و
 * `ContentStageTaskSync`)؛ هیچ جدول یا وضعیتِ تازه‌ای در اینجا ساخته نمی‌شود و
 * هر ثبت با تأییدِ صریحِ کاربر انجام می‌شود.
 */
final class ContentStageOutputs
{
    public function handle(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $action, ?string $text): bool
    {
        if (preg_match('/^pubout:(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            $stage = $this->stageOf($task);
            abort_unless($stage, 404, 'این وظیفه به مرحله‌ای از جریان محتوا وصل نیست.');
            $session?->delete();
            $rows = [];
            if ($user->hasPermission('assets.upload')) {
                $rows[] = [['text' => '📤 فرستادن فایل خروجی در همین بات', 'callback_data' => 'puboutfile:'.$task->id]];
            }
            $rows[] = [['text' => '📝 نوشتن متن خروجی', 'callback_data' => 'pubouttext:'.$task->id]];
            // وظیفهٔ مرحله همیشه به یک پروندهٔ محتوا وصل است؛ دکمهٔ سامانه همان
            // پرونده را باز می‌کند تا کاربر جریان محتوا را ببیند، نه برگهٔ وظیفه را.
            $contentId = is_numeric($task->content_id) ? (int) $task->content_id : null;
            foreach (app(PanelLinks::class)->buttons($link, $contentId ? 'content' : 'task', $contentId ?? $task->id) as $row) {
                $rows[] = $row;
            }
            $this->reply($key, $chat, $link, '📤 *ثبت خروجی مرحله* '."\n".'مرحله: '.MessageText::plain((string) ($stage['title'] ?? '—'), 120)
                ."\n\n".'فایل را همین‌جا بفرستید یا متن خروجی را بنویسید؛ ثبت در مخزن و اتصال به مرحله فقط پس از تأیید شما انجام می‌شود.',
                $rows, $task->id);

            return true;
        }
        if (preg_match('/^pubouttext:(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            abort_unless($this->stageOf($task), 404);
            BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => 'output_text', 'nonce' => bin2hex(random_bytes(12)),
                'data' => ['task_id' => $task->id], 'expires_at' => now()->addMinutes(10)]);
            $this->reply($key, $chat, $link, 'متن خروجی این مرحله را بنویسید (حداکثر ۳۰۰۰ نویسه).', [], $task->id);

            return true;
        }
        if (preg_match('/^puboutfile:(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[1]);
            abort_unless($this->stageOf($task), 404);
            abort_unless($user->hasPermission('assets.upload'), 403, 'برای دریافت پرونده، مجوز بارگذاری دارایی لازم است.');
            BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => 'output_file', 'nonce' => bin2hex(random_bytes(12)),
                'data' => ['task_id' => $task->id], 'expires_at' => now()->addMinutes(10)]);
            $this->reply($key, $chat, $link, '📤 پروندهٔ خروجی را همین‌جا در گفتگو بفرستید (تا '
                .MessageText::plain((string) intdiv(IncomingFile::MAX_BYTES, 1024 * 1024), 3).' مگابایت).', [], $task->id);

            return true;
        }
        if ($text !== null && $session?->step === 'output_text') {
            $task = app(TaskOperations::class)->ownForBale($user, $session->data['task_id']);
            Validator::make(['value' => $text], ['value' => 'required|string|max:3000'])->validate();
            $session->update(['step' => 'output_confirm', 'data' => [...$session->data, 'text' => $text]]);
            $this->reply($key, $chat, $link, "پیش‌نمایش خروجی:\n".MessageText::plain($text, 2800),
                [[['text' => '✅ تأیید ثبت خروجی', 'callback_data' => 'confirm:'.$session->nonce]]], $task->id);

            return true;
        }
        if (in_array($session?->step, ['output_confirm', 'output_file_confirm'], true) && preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            $session->delete();
            $task = app(TaskOperations::class)->ownForBale($user, $data['task_id']);
            $message = $this->register($user, $task, $data);
            $this->reply($key, $chat, $link, $message, [[['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$task->id]]], $task->id);

            return true;
        }

        return false;
    }

    /**
     * پرونده‌ای که کاربر در گفتگو فرستاده است؛ فقط وقتی فرمِ خروجی باز است.
     *
     * @param  array{file_id: string, name: string, size: int}  $file
     */
    public function receiveFile(string $key, string $chat, BaleUserLink $link, User $user, BaleConversation $session, array $file): bool
    {
        if ($session->step !== 'output_file') {
            return false;
        }
        $task = app(TaskOperations::class)->ownForBale($user, $session->data['task_id']);
        abort_unless($this->stageOf($task), 404);
        abort_unless($user->hasPermission('assets.upload'), 403);
        $files = app(IncomingFile::class);
        if ($file['size'] > IncomingFile::MAX_BYTES) {
            $this->reply($key, $chat, $link, $files->tooLargeText(), [], $task->id);

            return true;
        }
        $stored = $files->store($file);
        if (! $stored) {
            $this->reply($key, $chat, $link, 'دریافت این پرونده از بله ناموفق بود؛ دوباره بفرستید یا خروجی را از پنل تدبیر ثبت کنید.', [], $task->id);

            return true;
        }
        $files->discard($session->data['file'] ?? null);
        $session->update(['step' => 'output_file_confirm', 'nonce' => bin2hex(random_bytes(12)),
            'data' => [...$session->data, 'file' => $stored]]);
        $this->reply($key, $chat, $link, '📎 پرونده دریافت شد: '.MessageText::plain($stored['name'], 200)
            ."\n\n".'این پرونده به‌عنوان خروجیِ همین مرحله ثبت شود؟',
            [[['text' => '✅ تأیید ثبت خروجی', 'callback_data' => 'confirm:'.$session->nonce]]], $task->id);

        return true;
    }

    /** مرحلهٔ جاریِ این وظیفه در جریان محتوا (اگر وصل باشد). */
    public function stageOf(Task $task): ?array
    {
        $content = $task->content;
        if (! $content || ! $task->content_stage_id) {
            return null;
        }
        $stages = collect(is_array($content->payload['stages'] ?? null) ? $content->payload['stages'] : [])
            ->filter(fn ($stage) => is_array($stage));
        $stage = $stages->first(fn (array $stage) => (string) ($stage['id'] ?? '') === (string) $task->content_stage_id);

        return is_array($stage) ? $stage : null;
    }

    /**
     * ثبتِ نهایی خروجی در همان مرحله؛ دارایی (در صورت وجود پرونده) در مخزن
     * ساخته و به همان خروجی وصل می‌شود.
     *
     * @param  array<string, mixed>  $data
     */
    private function register(User $actor, Task $task, array $data): string
    {
        $clock = app(OrganizationTime::class);

        return DB::transaction(function () use ($actor, $task, $data, $clock): string {
            $content = Content::whereKey($task->content_id)->lockForUpdate()->firstOrFail();
            $stageId = (string) $task->content_stage_id;
            $stages = array_values(is_array($content->payload['stages'] ?? null) ? $content->payload['stages'] : []);
            $index = collect($stages)->search(fn ($stage) => is_array($stage) && (string) ($stage['id'] ?? '') === $stageId);
            abort_if($index === false, 409, 'این وظیفه دیگر به مرحله‌ای از جریان محتوا وصل نیست.');
            abort_if(in_array($stages[$index]['status'] ?? '', ['approved', 'completed', 'skipped'], true), 409, 'این مرحله بسته شده است.');

            $files = app(IncomingFile::class);
            $outputId = 'out-'.Str::lower(Str::random(10));
            $asset = null;
            $stored = is_array($data['file'] ?? null) ? $data['file'] : null;
            if ($stored) {
                $upload = $files->upload($stored);
                abort_unless($upload, 409, 'پروندهٔ دریافت‌شده دیگر در دسترس نیست؛ دوباره بفرستید.');
                try {
                    $asset = app(DamService::class)->create([
                        // نام دارایی پیش‌فرضاً کدِ همان پروندهٔ محتواست.
                        'title' => mb_substr((string) ($content->code ?: $stored['name']), 0, 255),
                        'description' => 'خروجی مرحلهٔ «'.(string) ($stages[$index]['title'] ?? '').'» ثبت‌شده از بات بله',
                        'content_id' => (string) $content->id,
                        'content_bucket' => 'outputs',
                        'relation_role' => DamRelationRole::STAGE_OUTPUT,
                        'stage_id' => $stageId,
                        'output_id' => $outputId,
                        'status' => 'approved',
                        'department_id' => $actor->department_id,
                    ], $actor, $upload);
                } finally {
                    $files->discard($stored);
                }
            }
            $version = $asset?->versions()->orderByDesc('version_number')->first();
            $title = trim((string) ($data['title'] ?? ''));
            $output = [
                'id' => $outputId,
                'name' => $title !== '' ? $title : ($asset?->title ?: 'خروجی ثبت‌شده از بله'),
                'isDelivered' => true,
                'deliveredAt' => $clock->date(),
                'deliveredBy' => (string) $actor->id,
                'value' => trim((string) ($data['text'] ?? '')) ?: null,
                'assetId' => $asset ? (string) $asset->id : null,
                'assetVersionId' => $version ? (string) $version->id : null,
                'assetVersionNumber' => $version ? (int) $version->version_number : null,
                'fileName' => $stored['name'] ?? null,
            ];
            $output = array_filter($output, fn ($value) => $value !== null);
            $stages[$index]['outputs'] = array_values([...array_values($stages[$index]['outputs'] ?? []), $output]);
            $stages = app(ContentAssetRelations::class)->normalize($actor, $content, $stages);
            $payload = [...($content->payload ?? []), 'stages' => $stages];
            $content->update(['payload' => $payload]);
            $fresh = $content->refresh();
            app(ContentAssetRelations::class)->sync($actor, $fresh);
            app(ContentStageTaskSync::class)->sync($fresh->refresh());
            ActivityLog::create(['user_id' => $actor->id, 'project_id' => $content->project_id, 'task_id' => $task->id,
                'type' => 'content_stage_output', 'action' => 'ثبت خروجی مرحله از بات بله',
                'details' => 'content:'.$content->id.'; stage:'.$stageId.'; output:'.$outputId,
                'metadata' => ['recordType' => 'content', 'recordId' => (string) $content->id, 'source' => 'bale']]);

            return '✅ خروجیِ مرحلهٔ «'.MessageText::plain((string) ($stages[$index]['title'] ?? '—'), 80).'» ثبت شد.'
                .($asset ? ' شمارهٔ دارایی: '.$asset->id : '');
        }, 3);
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
