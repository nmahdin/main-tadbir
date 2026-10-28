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
use App\Models\DomainRecord;
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
use Symfony\Component\HttpKernel\Exception\HttpException;

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
    /** سقف هر پیامِ متن خروجی (سقف پیام بله برای متن). */
    public const PART_CHARS = 4096;

    /** سقف کل متنِ یک خروجی؛ فراتر از آن ادامه از پنل نوشته می‌شود. */
    public const TOTAL_CHARS = 20000;

    /**
     * آخرین خروجیِ متنیِ همین مرحله (اگر خروجی متنی داشته باشد).
     *
     * @param  array<string, mixed>  $stage
     * @return array<string, mixed>|null
     */
    private function textOutputOf(array $stage): ?array
    {
        foreach (array_reverse(array_values(is_array($stage['outputs'] ?? null) ? $stage['outputs'] : [])) as $output) {
            if (is_array($output) && trim((string) ($output['value'] ?? '')) !== '') {
                return $output;
            }
        }

        return null;
    }

    /**
     * دکمهٔ «ثبت خروجی» برای اعلانِ وظیفهٔ تازه.
     *
     * اعلانِ واگذاریِ وظیفهٔ مرحلهٔ محتوا، بی‌دکمه می‌آمد و کاربر باید خودش
     * وظیفه را باز می‌کرد؛ همان مسیرِ بات (`pubout`) مستقیم از اعلان باز می‌شود.
     *
     * @return array<int, array<int, array{text: string, callback_data: string}>>
     */
    public function notificationRows(User $user, DomainRecord $record): array
    {
        $taskId = (int) ($record->payload['linkTaskId'] ?? 0);
        if ($taskId <= 0 || ! $user->hasPermission('tasks.view')) {
            return [];
        }
        $task = Task::whereKey($taskId)->where('assignee_id', $user->id)->first();
        if (! $task || ! $this->stageOf($task)) {
            return [];
        }

        return [[['text' => '📤 ثبت خروجی محتوا', 'callback_data' => 'pubout:'.$task->id]],
            [['text' => '📌 جزئیات وظیفه', 'callback_data' => 'task:'.$task->id]]];
    }

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
            // متنِ بلند در چند بخش نوشته می‌شود؛ اگر مرحله از قبل متن دارد، همان
            // خروجی ادامه پیدا می‌کند تا متن یکجا و کامل بماند.
            if ($this->textOutputOf($stage) !== null) {
                $rows[] = [['text' => '➕ افزودن به متن خروجیِ ثبت‌شده', 'callback_data' => 'puboutadd:'.$task->id]];
            }
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
        if (preg_match('/^pubout(text|add):(\d{1,18})$/', $action, $m)) {
            $task = app(TaskOperations::class)->ownForBale($user, $m[2]);
            $stage = $this->stageOf($task);
            abort_unless($stage, 404, 'این وظیفه به مرحله‌ای از جریان محتوا وصل نیست.');
            $existing = $m[1] === 'add' ? $this->textOutputOf($stage) : null;
            abort_if($m[1] === 'add' && $existing === null, 404, 'خروجی متنی برای افزودن در این مرحله نیست.');
            BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => 'output_text', 'nonce' => bin2hex(random_bytes(12)),
                'data' => ['task_id' => $task->id, 'parts' => [], 'append_to' => $existing['id'] ?? null], 'expires_at' => now()->addMinutes(30)]);
            $this->reply($key, $chat, $link, $existing
                ? '📝 متن تازه را بفرستید تا به خروجی ثبت‌شده افزوده شود (هر بخش تا '.MessageText::plain((string) self::PART_CHARS, 8).' نویسه). متن فعلی '.MessageText::plain((string) mb_strlen((string) ($existing['value'] ?? '')), 8).' نویسه است؛ با «✅ ثبت خروجی» متنِ افزوده‌شده ذخیره می‌شود.'
                : '📝 متن خروجی این مرحله را بنویسید (هر بخش تا '.MessageText::plain((string) self::PART_CHARS, 8).' نویسه). اگر متن بلند است، بخش اول را بفرستید؛ سپس بخش‌های بعدی را بفرستید و در پایان «✅ ثبت خروجی» را بزنید.', [], $task->id);

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
            Validator::make(['value' => $text], ['value' => 'required|string|max:4096'])->validate();
            $parts = is_array($session->data['parts'] ?? null) ? $session->data['parts'] : [];
            // متنی که رسیده همان‌جا نگه داشته می‌شود (تا سقف پیام بله). سقفِ
            // ۳۰۰۰ نویسهٔ پیشین باعث می‌شد متن‌های بلند هرگز ثبت نشوند.
            $length = array_sum(array_map(fn ($part) => mb_strlen((string) $part), $parts)) + mb_strlen($text);
            if ($length > self::TOTAL_CHARS) {
                $this->reply($key, $chat, $link, 'متن خروجی به سقف '.MessageText::plain((string) self::TOTAL_CHARS, 8)
                    .' نویسه رسید. آن را با «✅ ثبت خروجی» ذخیره کنید یا ادامهٔ متن را از پنل بنویسید.',
                    [[['text' => '✅ ثبت خروجی', 'callback_data' => 'outdone:'.$session->nonce]]], $task->id);

                return true;
            }
            $parts[] = $text;
            $session->update(['data' => [...$session->data, 'parts' => $parts]]);
            $joined = implode("\n", array_map('strval', $parts));
            $this->reply($key, $chat, $link, '📝 بخش '.MessageText::plain((string) count($parts), 4).' ثبت شد؛ جمعاً '
                .MessageText::plain((string) mb_strlen($joined), 8).' نویسه.'."\n\n".'این بخش را می‌بینید:'
                ."\n".MessageText::plain(mb_substr($text, -700), 800)."\n\n"
                .'بخش بعدی را بفرستید یا برای ذخیره «✅ ثبت خروجی» را بزنید.',
                [[['text' => '✅ ثبت خروجی', 'callback_data' => 'outdone:'.$session->nonce]]], $task->id);

            return true;
        }
        if (in_array($session?->step, ['output_text', 'output_confirm'], true)
            && preg_match('/^(outdone|outmore):([a-f0-9]{24})$/', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[2]), 409);
            $task = app(TaskOperations::class)->ownForBale($user, $session->data['task_id']);
            $parts = is_array($session->data['parts'] ?? null) ? $session->data['parts'] : [];
            if ($m[1] === 'outmore') {
                // بازگشت به حالت نوشتن تا متن در بخش‌های بعدی کامل شود.
                $session->update(['step' => 'output_text']);
                $this->reply($key, $chat, $link, 'بخش بعدی متن خروجی را بفرستید؛ به همان متن افزوده می‌شود.', [], $task->id);

                return true;
            }
            $joined = trim(implode("\n", array_map('strval', $parts)));
            abort_if($joined === '', 409, 'متنی برای ثبت وجود ندارد؛ ابتدا متن خروجی را بفرستید.');
            $session->update(['step' => 'output_confirm', 'data' => [...$session->data, 'text' => $joined]]);
            $append = ! empty($session->data['append_to']);
            $this->reply($key, $chat, $link, ($append ? 'پیش‌نمایش متنِ افزوده‌شده به خروجی قبلی:' : 'پیش‌نمایش خروجی:')."\n"
                .MessageText::plain(mb_substr($joined, -2500), 2600)."\n\n".'جمعاً '.MessageText::plain((string) mb_strlen($joined), 8).' نویسه.',
                [[['text' => '✅ تأیید ثبت خروجی', 'callback_data' => 'confirm:'.$session->nonce]],
                    [['text' => '➕ افزودن بخش دیگر', 'callback_data' => 'outmore:'.$session->nonce]]], $task->id);

            return true;
        }
        if (in_array($session?->step, ['output_confirm', 'output_file_confirm'], true) && preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            $session->delete();
            $task = app(TaskOperations::class)->ownForBale($user, $data['task_id']);
            try {
                $message = $this->register($user, $task, $data);
            } catch (HttpException $error) {
                // دلیلِ واقعیِ شکست (مرحلهٔ بسته‌شده، سقف متن، خروجیِ حذف‌شده)
                // به کاربر گفته می‌شود؛ پیام عمومی چیزی را روشن نمی‌کرد.
                $reason = $error->getMessage();
                $text = in_array(trim($reason), ['', 'Forbidden', 'Not Found', 'Conflict'], true)
                    ? 'این مرحله دیگر برای ثبت خروجی باز نیست یا دسترسی شما تغییر کرده است.'
                    : $reason;
                $this->reply($key, $chat, $link, '⚠️ ثبت خروجی انجام نشد: '.MessageText::plain($text, 500)
                    ."\n".'اگر مرحله بسته شده است، خروجی را از پنل بررسی کنید.', [[['text' => '↩️ بازگشت به تسک', 'callback_data' => 'task:'.$task->id]]], $task->id);

                return true;
            }
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
            $this->reply($key, $chat, $link, '❌ دریافت این پرونده از بله ناموفق بود: '.$files->failureText()
                ."\n"."می‌توانید خروجی را از پنل تدبیر هم ثبت کنید.", [], $task->id);

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
            $text = trim((string) ($data['text'] ?? ''));
            // «افزودن به خروجی قبلی»: همان خروجی به‌روزرسانی می‌شود تا متنِ
            // چندبخشی یک خروجی بماند و تاریخچهٔ جریان شلوغ نشود.
            $appendTo = trim((string) ($data['append_to'] ?? ''));
            if ($appendTo !== '' && $text !== '') {
                $existing = array_values(array_filter($stages[$index]['outputs'] ?? [], fn ($output) => is_array($output) && (string) ($output['id'] ?? '') === $appendTo));
                abort_if($existing === [], 409, 'خروجیِ قبلی این مرحله پیدا نشد؛ دوباره از «ثبت خروجی محتوا» شروع کنید.');
                $current = trim((string) ($existing[0]['value'] ?? ''));
                $joined = $current === '' ? $text : $current."\n".$text;
                if (mb_strlen($joined) > self::TOTAL_CHARS) {
                    abort(409, 'متن این خروجی از سقف '.self::TOTAL_CHARS.' نویسه می‌گذرد؛ بخش بعدی را از پنل یا به‌صورت فایل ثبت کنید.');
                }
                $stages[$index]['outputs'] = array_map(function ($output) use ($appendTo, $joined, $clock, $actor) {
                    if (! is_array($output) || (string) ($output['id'] ?? '') !== $appendTo) {
                        return $output;
                    }

                    return [...$output, 'value' => $joined, 'isDelivered' => true,
                        'appendedAt' => $clock->date(), 'appendedBy' => (string) $actor->id];
                }, array_values($stages[$index]['outputs'] ?? []));
                $stages = app(ContentAssetRelations::class)->normalize($actor, $content, $stages);
                $content->update(['payload' => [...($content->payload ?? []), 'stages' => $stages]]);
                $fresh = $content->refresh();
                app(ContentAssetRelations::class)->sync($actor, $fresh);
                app(ContentStageTaskSync::class)->sync($fresh->refresh());
                ActivityLog::create(['user_id' => $actor->id, 'project_id' => $content->project_id, 'task_id' => $task->id,
                    'type' => 'content_stage_output', 'action' => 'افزودن متن به خروجی مرحله از بات بله',
                    'details' => 'content:'.$content->id.'; stage:'.$stageId.'; output:'.$appendTo,
                    'metadata' => ['recordType' => 'content', 'recordId' => (string) $content->id, 'source' => 'bale']]);

                return '✅ متن به خروجیِ قبلی همین مرحله افزوده شد ('.mb_strlen($joined).' نویسه).';
            }
            $output = [
                'id' => $outputId,
                'name' => $title !== '' ? $title : ($asset?->title ?: 'خروجی ثبت‌شده از بله'),
                'isDelivered' => true,
                'deliveredAt' => $clock->date(),
                'deliveredBy' => (string) $actor->id,
                'value' => $text !== '' ? $text : null,
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
