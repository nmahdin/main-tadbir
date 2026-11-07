<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Meetings\MeetingBrowser;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\OperationsSchema;
use App\Bot\Bale\Support\PanelLinks;
use App\Bot\Bale\Support\PersianDate;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\Department;
use App\Models\Task;
use App\Models\User;
use App\Services\Access\UserPermissionGate;
use App\Services\DamTableAccess;
use App\Services\DamTableRows;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\Validator;

/** Expiring forms only; final records are saved by shared domain services on nonce confirmation. */
final class OperationalMenus
{
    private const FIELDS = ['title' => 'عنوان', 'description' => 'توضیح', 'deadline' => 'مهلت (میلادی YYYY-MM-DD)', 'priority' => 'اولویت'];

    public function handle(string $key, string $chat, BaleUserLink $link, User $user, ?BaleConversation $session, string $action, ?string $text): bool
    {
        // All table-row actions are handled by a dedicated state machine.
        // Never allow the unrelated task/meeting handlers to consume a cell.
        if (app(TableRowFlow::class)->handle($key, $chat, $link, $user, $session, $action, $text)) {
            return true;
        }

        $taskId = null;
        $send = function (string $body, array $buttons = [], ?string $type = null, ?int $id = null, array $meta = []) use ($key, $chat, $link, &$taskId) {
            $this->reply($key, $chat, $link, $body, $buttons, $type, $id, $taskId && str_starts_with($type ?? '', 'asset_') ? [...$meta, '_task_id' => $taskId] : $meta);
        };
        $ops = app(TaskOperations::class);
        $taskId = str_starts_with($session?->step ?? '', 'asset_') ? ($session->data['task_id'] ?? null) : null;
        if ($taskId && $action !== 'assetrows' && ! str_starts_with($action, 'assetrows:') && (str_starts_with($action, 'asset') || str_starts_with($action, 'department') || str_starts_with($action, 'confirm:') || $text !== null)) {
            $ops->ownForBale($user, $taskId);
        }
        if (preg_match('/^edit:(\d{1,18})$/', $action, $m)) {
            $task = $this->task($user, $m[1]);
            $session?->delete();
            $rows = [];
            foreach (self::FIELDS as $field => $label) {
                $rows[] = [['text' => $label, 'callback_data' => 'editfield:'.$task->id.':'.$field]];
            }
            $send('کدام بخش وظیفه ویرایش شود؟', $rows, 'task', $task->id);
        } elseif (preg_match('/^editfield:(\d{1,18}):(title|description|deadline|priority)$/', $action, $m)) {
            $task = $this->task($user, $m[1]);
            $session = $this->session($link, 'edit_value', ['task_id' => $task->id, 'field' => $m[2], 'version' => $ops->editVersion($task)]);
            $rows = [];
            if ($m[2] === 'priority') {
                foreach (['low' => 'کم', 'medium' => 'متوسط', 'high' => 'زیاد', 'urgent' => 'فوری'] as $value => $label) {
                    $rows[] = [['text' => $label, 'callback_data' => 'priority:'.$session->nonce.':'.$value]];
                }
            }
            $send('مقدار جدید '.self::FIELDS[$m[2]].' را وارد کنید. برای پاک کردن توضیح یا مهلت، فقط «-» بفرستید.', $rows, 'task', $task->id);
        } elseif (($text !== null && $session?->step === 'edit_value') || str_starts_with($action, 'priority:')) {
            abort_unless($session?->step === 'edit_value', 409);
            $task = $this->task($user, $session->data['task_id']);
            $field = $session->data['field'];
            $value = $text;
            if (str_starts_with($action, 'priority:')) {
                $parts = explode(':', $action);
                abort_unless(count($parts) === 3 && $field === 'priority' && hash_equals($session->nonce, $parts[1]), 409);
                $value = $parts[2];
            }
            if ($value === '-' && in_array($field, ['description', 'deadline'], true)) {
                $value = null;
            }
            $validated = Validator::make([$field => $value], $ops->detailRules($task))->validate();
            $session->update(['step' => 'edit_confirm', 'data' => [...$session->data, 'changes' => $validated]]);
            $send("پیش‌نمایش ویرایش:\n".self::FIELDS[$field].":\n".MessageText::plain($value ?? 'پاک شود'), $this->confirmButton($session), 'task', $task->id);
        } elseif (preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m) && $session?->step === 'edit_confirm') {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            $task = $this->task($user, $data['task_id']);
            $ops->editDetails($user, $task, $data['changes'], $data['version'], 'bale');
            $session->delete();
            $send('ویرایش وظیفه ثبت شد.', [[['text' => 'دیدن وظیفه', 'callback_data' => 'task:'.$task->id]]], 'task', $task->id);
        } elseif ($action === 'meetings' || preg_match('/^meetings:(\d{1,5})$/', $action, $m)) {
            $session?->delete();
            $page = $action === 'meetings' ? 0 : (int) $m[1];
            $upcoming = app(MeetingBrowser::class)->upcoming($user);
            $meetings = $upcoming->slice($page * 5, 5)->values();
            $rows = [];
            $body = "📅 *جلسات آیندهٔ من* \n\n";
            foreach ($meetings->take(5) as $i => $meeting) {
                $body .= PersianDate::digits($i + 1).'. '.MessageText::plain($meeting->title, 150)."\n🗓 ".PersianDate::format($meeting->payload['date'] ?? null)."\n\n";
                $rows[] = [['text' => '🔎 جزئیات جلسه '.PersianDate::digits($i + 1), 'callback_data' => 'meeting:'.$meeting->id]];
            }
            $this->pages($rows, 'meetings:', $page, $upcoming->count() > ($page + 1) * 5);
            $send($meetings->isEmpty() ? '📅 جلسهٔ آینده‌ای برای شما ثبت نشده است.' : $body, $rows, 'meetings', null, ['_subject_ids' => $meetings->pluck('id')->all()]);
        } elseif (preg_match('/^meeting:(\d{1,18})$/', $action, $m)) {
            $session?->delete();
            $browser = app(MeetingBrowser::class);
            $meeting = $browser->detail($user, (int) $m[1]);
            $send($browser->text($meeting), [[['text' => '📅 بازگشت به جلسات', 'callback_data' => 'meetings']]], 'meeting', $meeting->id);
        } else {
            return false;
        }

        return true;
    }

    private function fieldPrompt(\Closure $send, DamDataTable $table, BaleConversation $session): void
    {
        $d = $session->data;
        $columns = app(DamTableRows::class)->schema($table);
        $c = $columns[$d['index']];
        $type = $c['type'] ?? 'text';
        $rows = [];
        if ($type === 'select') {
            foreach (array_slice($c['options'] ?? [], 0, 20) as $i => $option) {
                $rows[] = [['text' => mb_substr($option, 0, 50), 'callback_data' => 'assetpick:'.$session->nonce.':'.$i]];
            }
        }
        $hint = match ($type) {
            'date' => 'تاریخ میلادی YYYY-MM-DD', 'number' => 'عدد با رقم انگلیسی', 'select' => 'یکی از گزینه‌ها (یا متن دقیق گزینه)', default => 'متن'
        };
        $send('فیلد '.($d['index'] + 1).' از '.count($columns).': '.MessageText::plain($c['name'], 100)."\n".$hint.(($c['required'] ?? false) ? ' — اجباری' : ' — اختیاری؛ «-» یعنی خالی'), $rows, 'asset_table', $table->id, isset($d['department_id']) ? ['_department_id' => $d['department_id']] : []);
    }

    private function task(User $u, int|string $id): Task
    {
        $task = Task::find($id);
        abort_unless($task && (int) $task->assignee_id === (int) $u->id && app(TaskOperations::class)->editable($u, $task), 403);

        return $task;
    }

    /**
     * جدولِ مجازِ همین کاربر. `null` یعنی جدول به دپارتمانی وصل نیست و همان
     * قانونِ ویرایش (`canEdit`) کافی است؛ در غیر این صورت اتصالِ صریحِ همان
     * دپارتمان لازم است.
     */
    private function table(User $u, int $id, ?int $department): DamDataTable
    {
        $table = DamDataTable::find($id);
        abort_unless($table, 404);
        $allowed = $department === null
            ? ($u->isActive() && $u->hasPermission('assets.view') && app(DamTableAccess::class)->canEdit($u, $table))
            : app(DamTableAccess::class)->botAllowed($u, $table, $department);
        abort_unless($allowed, 403);

        return $table;
    }

    private function session(BaleUserLink $link, string $step, array $data): BaleConversation
    {
        return BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => $step, 'nonce' => bin2hex(random_bytes(12)), 'data' => $data, 'expires_at' => MenuNavigation::lifetime()]);
    }

    private function confirmButton(BaleConversation $s): array
    {
        return [[['text' => 'تأیید ثبت', 'callback_data' => 'confirm:'.$s->nonce]]];
    }

    private function pages(array &$rows, string $prefix, int $page, bool $more): void
    {
        if ($page > 0) {
            $rows[] = [['text' => 'صفحه قبل', 'callback_data' => $prefix.($page - 1)]];
        }
        if ($more) {
            $rows[] = [['text' => 'صفحه بعد', 'callback_data' => $prefix.($page + 1)]];
        }
    }

    private function reply(string $key, string $chat, BaleUserLink $link, string $text, array $rows, ?string $type, ?int $id, array $meta): void
    {
        $rows = [...$rows, ...MenuNavigation::rows($link)];
        $rows = [...$rows, ...app(PanelLinks::class)->buttons($link, $type, $id)];
        app(Outbox::class)->enqueue($key, $chat, [...$meta, 'text' => $text, 'reply_markup' => ['inline_keyboard' => $rows]], $link, $type, $id);
    }
}
