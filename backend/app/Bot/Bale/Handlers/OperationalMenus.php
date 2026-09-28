<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Meetings\MeetingBrowser;
use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\OperationsSchema;
use App\Bot\Bale\Support\PanelLinks;
use App\Bot\Bale\Support\PersianDate;
use App\Models\ActivityLog;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
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
        $taskId = null;
        $send = function (string $body, array $buttons = [], ?string $type = null, ?int $id = null, array $meta = []) use ($key, $chat, $link, &$taskId) {
            $this->reply($key, $chat, $link, $body, $buttons, $type, $id, $taskId && str_starts_with($type ?? '', 'asset_') ? [...$meta, '_task_id' => $taskId] : $meta);
        };
        $ops = app(TaskOperations::class);
        $taskId = str_starts_with($session?->step ?? '', 'asset_') ? ($session->data['task_id'] ?? null) : null;
        if ($taskId && $action !== 'assets' && ! str_starts_with($action, 'assetrows:') && (str_starts_with($action, 'asset') || str_starts_with($action, 'confirm:') || $text !== null)) {
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
        } elseif (preg_match('/^confirm:([a-f0-9]{24})$/', $action, $m) && in_array($session?->step, ['edit_confirm', 'asset_confirm'], true)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data = $session->data;
            if ($session->step === 'edit_confirm') {
                $task = $this->task($user, $data['task_id']);
                $ops->editDetails($user, $task, $data['changes'], $data['version'], 'bale');
                $send('ویرایش وظیفه ثبت شد.', [[['text' => 'دیدن وظیفه', 'callback_data' => 'task:'.$task->id]]], 'task', $task->id);
            } else {
                $table = $this->table($user, $data['table_id'], $data['team_id']);
                $row = app(DamTableRows::class)->create($user, $table, ['cells' => $data['cells'], 'task_id' => $data['task_id'] ?? null], $data['team_id'], $data['version']);
                $send('دارایی با شناسه '.$row->id.' ثبت شد.', [], 'asset_table', $table->id, ['_team_id' => $data['team_id']]);
            }
            $session->delete();
        } elseif ($action === 'assets' || preg_match('/^assetsteams:(\d{1,5})$/', $action, $m) || preg_match('/^assetrows:(\d{1,18})$/', $action, $taskMatch)) {
            abort_unless($user->hasPermission('assets.view'), 403);
            app(OperationsSchema::class)->require('assets');
            if ($action === 'assets') {
                $taskId = null;
            }
            if (! empty($taskMatch)) {
                $taskId = $ops->ownForBale($user, $taskMatch[1])->id;
            }
            $session = $this->session($link, 'asset_context', ['task_id' => $taskId]);
            $page = str_starts_with($action, 'assetsteams:') ? (int) $m[1] : 0;
            $teams = Team::where('status', 'active')->whereHas('users', fn ($q) => $q->where('users.id', $user->id))->orderBy('id')->offset($page * 5)->limit(6)->get();
            $rows = $teams->take(5)->map(fn ($t) => [['text' => mb_substr($t->name, 0, 50), 'callback_data' => 'assetstables:'.$t->id.':0']])->all();
            $this->pages($rows, 'assetsteams:', $page, $teams->count() > 5);
            $send(($taskId ? '📌 ثبت ردیف برای تسک شماره '.$taskId."\n" : '').'برای ثبت دارایی، تیم خود را انتخاب کنید. فقط جدول دارای اتصال صریح تیم و مجوز ویرایش نمایش داده می‌شود.', $rows, 'asset_teams', null, ['_subject_ids' => $teams->take(5)->pluck('id')->all()]);
        } elseif (preg_match('/^assetstables:(\d{1,18}):(\d{1,5})$/', $action, $m)) {
            $teamId = (int) $m[1];
            $page = (int) $m[2];
            abort_unless($user->hasPermission('assets.view') && Team::whereKey($teamId)->where('teams.status', 'active')->whereHas('users', fn ($q) => $q->where('users.id', $user->id))->exists(), 403);
            app(OperationsSchema::class)->require('assets');
            $session = $this->session($link, 'asset_context', ['task_id' => $taskId]);
            // Paginate the scoped candidates, then filter with the same panel ACL (never infer grants from names).
            $candidates = DamDataTable::whereHas('teams', fn ($q) => $q->where('teams.id', $teamId))->orderBy('id')->offset($page * 5)->limit(6)->get();
            $tables = $candidates->take(5)->filter(fn ($t) => app(DamTableAccess::class)->botAllowed($user, $t, $teamId));
            $rows = $tables->map(fn ($t) => [['text' => mb_substr($t->name, 0, 50), 'callback_data' => 'assetform:'.$teamId.':'.$t->id]])->values()->all();
            $this->pages($rows, 'assetstables:'.$teamId.':', $page, $candidates->count() > 5);
            $send($tables->isEmpty() ? 'در این صفحه جدول قابل ویرایش ندارید. اتصال تیم به جدول و مجوز ویرایش را از مدیر بخواهید.' : 'جدول دارایی را انتخاب کنید.', $rows, 'asset_tables', null, ['_team_id' => $teamId, '_subject_ids' => $tables->pluck('id')->all()]);
        } elseif (preg_match('/^assetform:(\d{1,18}):(\d{1,18})$/', $action, $m)) {
            $table = $this->table($user, (int) $m[2], (int) $m[1]);
            app(DamTableRows::class)->schema($table);
            $session = $this->session($link, 'asset_field', ['task_id' => $taskId, 'team_id' => (int) $m[1], 'table_id' => $table->id, 'version' => DamTableRows::version($table), 'index' => 0, 'cells' => []]);
            $this->fieldPrompt($send, $table, $session);
        } elseif (($text !== null && $session?->step === 'asset_field') || str_starts_with($action, 'assetpick:')) {
            abort_unless($session?->step === 'asset_field', 409);
            $data = $session->data;
            $table = $this->table($user, $data['table_id'], $data['team_id']);
            abort_unless(hash_equals(DamTableRows::version($table), $data['version']), 409);
            $columns = app(DamTableRows::class)->schema($table);
            $column = $columns[$data['index']];
            $value = $text;
            if (str_starts_with($action, 'assetpick:')) {
                $parts = explode(':', $action);
                abort_unless(count($parts) === 3 && hash_equals($session->nonce, $parts[1]) && ($column['type'] ?? '') === 'select' && ctype_digit($parts[2]) && isset($column['options'][(int) $parts[2]]), 409);
                $value = $column['options'][(int) $parts[2]];
            } elseif ($text === '-' && ! ($column['required'] ?? false)) {
                $value = null;
            }
            Validator::make(['value' => $value], ['value' => app(DamTableRows::class)->rules($column)])->validate();
            $data['cells'][$column['id']] = $value;
            $data['index']++;
            // Rotate the nonce per field: old select buttons can never answer the next question.
            $session->update(['nonce' => bin2hex(random_bytes(12)), 'data' => $data]);
            if ($data['index'] < count($columns)) {
                $this->fieldPrompt($send, $table, $session);
            } else {
                app(DamTableRows::class)->validateCells($table, $data['cells']);
                $preview = ($taskId ? '📌 تسک: '.MessageText::plain($ops->ownForBale($user, $taskId)->title, 180)."\n" : '').'پیش‌نمایش ثبت در '.MessageText::plain($table->name, 100)."\n";
                foreach ($columns as $c) {
                    $preview .= MessageText::plain($c['name'], 80).': '.MessageText::plain((string) ($data['cells'][$c['id']] ?? '—'), 3000)."\n";
                }
                abort_if(mb_strlen($preview) > 3800, 422, 'این فرم برای پیش‌نمایش بات طولانی است؛ در پنل ثبت کنید.');
                $session->update(['step' => 'asset_confirm']);
                $send($preview, $this->confirmButton($session), 'asset_table', $table->id, ['_team_id' => $data['team_id']]);
            }
        } elseif ($action === 'notifications' || preg_match('/^notifs:([01])$/', $action, $m)) {
            $session?->delete();
            app(OperationsSchema::class)->require('notifications');
            if ($action !== 'notifications') {
                $link->update(['notifications_enabled' => $m[1] === '1']);
                ActivityLog::create(['user_id' => $user->id, 'type' => 'bale_preferences_changed', 'action' => 'تغییر دریافت اعلان بله', 'details' => 'source:bale']);
            }
            $send('دریافت اعلان جدید در بله: '.($link->notifications_enabled ? 'روشن' : 'خاموش')."\nاعلان‌های داخلی تدبیر مستقل باقی می‌مانند.", [[['text' => $link->notifications_enabled ? 'توقف دریافت در بله' : 'فعال کردن دریافت در بله', 'callback_data' => 'notifs:'.($link->notifications_enabled ? '0' : '1')]]]);
        } elseif ($action === 'meetings' || preg_match('/^meetings:(\d{1,5})$/', $action, $m)) {
            $session?->delete();
            $page = $action === 'meetings' ? 0 : (int) $m[1];
            $meetings = app(MeetingBrowser::class)->query($user)->orderByDesc('id')->offset($page * 5)->limit(6)->get();
            $rows = [];
            $body = "📅 *جلسات من* \n\n";
            foreach ($meetings->take(5) as $i => $meeting) {
                $body .= PersianDate::digits($i + 1).'. '.MessageText::plain($meeting->title, 150)."\n🗓 ".PersianDate::format($meeting->payload['date'] ?? null)."\n\n";
                $rows[] = [['text' => '🔎 جزئیات جلسه '.PersianDate::digits($i + 1), 'callback_data' => 'meeting:'.$meeting->id]];
            }
            $this->pages($rows, 'meetings:', $page, $meetings->count() > 5);
            $send($meetings->isEmpty() ? '📅 جلسهٔ مرتبطی در این صفحه ندارید.' : $body, $rows, 'meetings', null, ['_subject_ids' => $meetings->take(5)->pluck('id')->all()]);
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
        $send('فیلد '.($d['index'] + 1).' از '.count($columns).': '.MessageText::plain($c['name'], 100)."\n".$hint.(($c['required'] ?? false) ? ' — اجباری' : ' — اختیاری؛ «-» یعنی خالی'), $rows, 'asset_table', $table->id, ['_team_id' => $d['team_id']]);
    }

    private function task(User $u, int|string $id): Task
    {
        $task = Task::find($id);
        abort_unless($task && (int) $task->assignee_id === (int) $u->id && app(TaskOperations::class)->editable($u, $task), 403);

        return $task;
    }

    private function table(User $u, int $id, int $team): DamDataTable
    {
        $table = DamDataTable::find($id);
        abort_unless($table && app(DamTableAccess::class)->botAllowed($u, $table, $team), 403);

        return $table;
    }

    private function session(BaleUserLink $link, string $step, array $data): BaleConversation
    {
        return BaleConversation::updateOrCreate(['link_id' => $link->id], ['step' => $step, 'nonce' => bin2hex(random_bytes(12)), 'data' => $data, 'expires_at' => now()->addMinutes(10)]);
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
        $rows[] = [['text' => 'بازگشت به منو', 'callback_data' => 'home'], ['text' => 'لغو', 'callback_data' => 'cancel']];
        $rows = [...$rows, ...app(PanelLinks::class)->buttons($type, $id)];
        app(Outbox::class)->enqueue($key, $chat, [...$meta, 'text' => $text, 'reply_markup' => ['inline_keyboard' => $rows]], $link, $type, $id);
    }
}
