<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Outbox;
use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Bot\Bale\Support\OperationsSchema;
use App\Bot\Bale\Support\PanelLinks;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\DamAsset;
use App\Services\DamAssetAccess;
use App\Models\User;
use App\Services\Access\UserPermissionGate;
use App\Services\DamTableAccess;
use App\Services\DamTableRows;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * One purpose, one state machine: table selection -> one column per message
 * -> review/edit -> explicit idempotent confirmation.
 *
 * The draft stays in BaleConversation (encrypted), is checkpointed by Outbox,
 * and never falls back to the main menu. Other bot menus cannot mutate it.
 */
final class TableRowFlow
{
    public function handle(
        string $key, string $chat, BaleUserLink $link, User $user,
        ?BaleConversation $session, string $action, ?string $text
    ): bool {
        if ($action === 'assetrows' || preg_match('/^assetrows:(\d{1,18})$/D', $action, $m)) {
            $taskId = $action === 'assetrows' ? null : app(TaskOperations::class)->ownForBale($user, $m[1])->id;
            $this->listTables($key, $chat, $link, $user, $taskId);

            return true;
        }

        if ($session?->step === 'asset_context') {
            if (preg_match('/^assetpage:([a-f0-9]{24}):(\d{1,5})$/D', $action, $m)) {
                if (! hash_equals($session->nonce, $m[1])) {
                    $this->remind($key, $chat, $link, $session);

                    return true;
                }
                $this->listTables($key, $chat, $link, $user, $session->data['task_id'] ?? null, (int) $m[2]);

                return true;
            }
            if (preg_match('/^assettable:([a-f0-9]{24}):(\d{1,2})$/D', $action, $m)) {
                if (! hash_equals($session->nonce, $m[1]) || ! isset($session->data['tables'][$m[2]])) {
                    $this->remind($key, $chat, $link, $session);

                    return true;
                }
                $index = (int) $m[2];
                $department = $session->data['departments'][$index] ?? null;
                $table = $this->table($user, (int) $session->data['tables'][$index],
                    is_numeric($department) ? (int) $department : null);
                $this->start($key, $chat, $link, $table, $session->data['task_id'] ?? null,
                    is_numeric($department) ? (int) $department : null);

                return true;
            }
            if ($text !== null) {
                $this->remind($key, $chat, $link, $session);

                return true;
            }
        }

        if (preg_match('/^tableform:(\d{1,18})$/D', $action, $m)) {
            $this->start($key, $chat, $link, $this->table($user, (int) $m[1], null),
                $session?->data['task_id'] ?? null, null);

            return true;
        }
        if (preg_match('/^departmentform:(\d{1,18}):(\d{1,18})$/D', $action, $m)) {
            $department = (int) $m[1];
            $this->start($key, $chat, $link, $this->table($user, (int) $m[2], $department),
                $session?->data['task_id'] ?? null, $department);

            return true;
        }

        if (! in_array($session?->step, ['asset_field', 'asset_confirm'], true)) {
            return false;
        }

        // All subsequent actions are authenticated to this session and table.
        $data = $session->data;
        $department = is_numeric($data['department_id'] ?? null) ? (int) $data['department_id'] : null;
        $table = $this->table($user, (int) $data['table_id'], $department);
        $columns = app(DamTableRows::class)->schema($table);

        if (! hash_equals((string) ($data['version'] ?? ''), DamTableRows::version($table))) {
            // Do not accept the answer for a column whose definition has changed.
            // Keep values with surviving IDs and explicitly re-ask the first
            // incomplete column; never silently reinterpret an answer.
            $validIds = array_flip(array_column($columns, 'id'));
            $data['cells'] = array_intersect_key(is_array($data['cells'] ?? null) ? $data['cells'] : [], $validIds);
            $data['version'] = DamTableRows::version($table);
            $data['index'] = $this->firstIncomplete($columns, $data['cells']);
            $data['editing'] = false;
            $session->update(['step' => 'asset_field', 'nonce' => $this->nonce(), 'data' => $data]);
            // One update_id permits just one outbox reply: putting a warning
            // and a second question in separate messages silently drops the
            // question. Include the warning in the new field prompt instead.
            $this->prompt($key, $chat, $link, $table, $session,
                '⚠️ تعریف ستون‌های جدول تغییر کرده است. مقادیر ستون‌های باقی‌مانده محفوظ‌اند؛ این فیلد را دوباره بررسی کنید.');

            return true;
        }

        if ($session->step === 'asset_confirm') {
            if (preg_match('/^assetedit:([a-f0-9]{24}):(\d{1,3})$/D', $action, $m)) {
                if (! hash_equals($session->nonce, $m[1]) || ! isset($columns[(int) $m[2]])) {
                    $this->remind($key, $chat, $link, $session);

                    return true;
                }
                $data['index'] = (int) $m[2];
                $data['editing'] = true;
                $session->update(['step' => 'asset_field', 'nonce' => $this->nonce(), 'data' => $data]);
                $this->prompt($key, $chat, $link, $table, $session);

                return true;
            }
            if (preg_match('/^confirm:([a-f0-9]{24})$/D', $action, $m)) {
                if (! hash_equals($session->nonce, $m[1])) {
                    $this->remind($key, $chat, $link, $session);

                    return true;
                }
                // Recheck all required columns and access to linked user/assets.
                app(DamTableRows::class)->validateCells($table, $data['cells'] ?? [], $user);
                $taskId = $data['task_id'] ?? null;
                if ($taskId !== null) {
                    app(TaskOperations::class)->ownForBale($user, $taskId);
                }
                $row = app(DamTableRows::class)->create($user, $table,
                    ['cells' => $data['cells'], 'task_id' => $taskId], $department, $data['version']);
                $session->delete();
                $this->reply($key, $chat, $link, '✅ ردیف با شناسه '.$row->id.' در جدول «'.MessageText::plain($table->name, 80).'» ثبت شد.',
                    [], 'asset_table', $table->id, $data);

                return true;
            }
            if ($text !== null) {
                $this->reply($key, $chat, $link, 'اطلاعات آمادهٔ ثبت است. برای اصلاح، دکمهٔ ویرایش همان فیلد را بزنید؛ برای ذخیره «تأیید ثبت» را انتخاب کنید.',
                    $this->reviewButtons($columns, $session), 'asset_table', $table->id, $data);

                return true;
            }

            return false;
        }

        // Entering one column: reject callbacks from older steps.
        $idx = (int) ($data['index'] ?? -1);
        if (! isset($columns[$idx])) {
            $data['index'] = $this->firstIncomplete($columns, $data['cells'] ?? []);
            $session->update(['data' => $data, 'nonce' => $this->nonce()]);
            $this->prompt($key, $chat, $link, $table, $session);

            return true;
        }

        $column = $columns[$idx];
        $required = (bool) ($column['required'] ?? false);
        $value = null;
        if (preg_match('/^assetback:([a-f0-9]{24})$/D', $action, $m)) {
            if (! hash_equals($session->nonce, $m[1])) {
                $this->remind($key, $chat, $link, $session);

                return true;
            }
            if ($idx > 0) {
                $data['index'] = $idx - 1;
                $data['editing'] = false;
                $session->update(['data' => $data, 'nonce' => $this->nonce()]);
            }
            $this->prompt($key, $chat, $link, $table, $session);

            return true;
        }

        if (preg_match('/^assetskip:([a-f0-9]{24})$/D', $action, $m)) {
            if (! hash_equals($session->nonce, $m[1]) || $required) {
                $this->remind($key, $chat, $link, $session);

                return true;
            }
        } elseif (preg_match('/^assetpick:([a-f0-9]{24}):(\d{1,3})$/D', $action, $m)) {
            $options = $column['options'] ?? [];
            if (! hash_equals($session->nonce, $m[1]) || ($column['type'] ?? '') !== 'select'
                || ! is_array($options) || ! array_key_exists((int) $m[2], $options)) {
                $this->remind($key, $chat, $link, $session);

                return true;
            }
            $value = $options[(int) $m[2]];
        } elseif (preg_match('/^assetbool:([a-f0-9]{24}):(0|1)$/D', $action, $m)) {
            if (! hash_equals($session->nonce, $m[1]) || ($column['type'] ?? '') !== 'boolean') {
                $this->remind($key, $chat, $link, $session);

                return true;
            }
            $value = $m[2];
        } elseif ($text !== null) {
            if ($text === '') {
                $this->prompt($key, $chat, $link, $table, $session, '⚠️ لطفاً مقدار این فیلد را بنویسید.');

                return true;
            }
            $value = $text === '-' && ! $required ? null : $text;
            if (($column['type'] ?? '') === 'boolean') {
                $value = match (mb_strtolower($text)) {
                    'بله', 'درست', 'true' => '1',
                    'خیر', 'نادرست', 'false' => '0',
                    default => $value,
                };
            }
        } else {
            return false;
        }

        try {
            Validator::make(['value' => $value], ['value' => app(DamTableRows::class)->rules($column)])->validate();
            // Full-table validation belongs at review time. Validating a
            // single field as the whole table would fail whenever another
            // required field has not been answered yet.
            if ($value !== null && $value !== '') {
                if (($column['type'] ?? '') === 'asset') {
                    $asset = DamAsset::find((int) $value);
                    if (! $asset || ! app(DamAssetAccess::class)->canView($user, $asset)) {
                        throw ValidationException::withMessages(['value' => 'دارایی انتخابی در دسترس نیست.']);
                    }
                }
                if (($column['type'] ?? '') === 'user'
                    && ! User::whereKey((int) $value)->where('status', 'active')->exists()) {
                    throw ValidationException::withMessages(['value' => 'کاربر انتخابی معتبر نیست.']);
                }
            }
        } catch (ValidationException $e) {
            $reason = collect($e->errors())->flatten()->first() ?? 'مقدار واردشده معتبر نیست.';
            $this->prompt($key, $chat, $link, $table, $session, '⚠️ '.MessageText::plain((string) $reason, 270));

            return true;
        }

        $data['cells'][$column['id']] = $value;
        $editing = (bool) ($data['editing'] ?? false);
        $data['editing'] = false;
        $data['index'] = $idx + 1;
        $session->update(['nonce' => $this->nonce(), 'data' => $data]);

        if ($editing || $data['index'] >= count($columns)) {
            $this->review($key, $chat, $link, $user, $table, $session);

            return true;
        }

        $this->prompt($key, $chat, $link, $table, $session);

        return true;
    }

    private function listTables(
        string $key, string $chat, BaleUserLink $link, User $user,
        ?int $taskId, int $page = 0
    ): void {
        app(UserPermissionGate::class)->authorizeAny($user, 'assets.view');
        app(OperationsSchema::class)->require('assets');
        if ($taskId !== null) {
            app(TaskOperations::class)->ownForBale($user, $taskId);
        }
        $options = app(DamTableAccess::class)->botEditable($user);
        if ($options === []) {
            BaleConversation::where('link_id', $link->id)->delete();
            $this->reply($key, $chat, $link, 'هیچ جدول قابل ویرایشی برای حساب شما پیدا نشد. مجوزها و عضویت دپارتمان را بررسی کنید.');

            return;
        }
        $page = min($page, max(0, (int) ceil(count($options) / 5) - 1));
        $chunk = array_slice($options, $page * 5, 5);
        $data = [
            'task_id' => $taskId,
            'page' => $page,
            'tables' => array_map(fn ($opt) => (int) $opt['table']->id, $chunk),
            'departments' => array_map(fn ($opt) => $opt['department_id'], $chunk),
        ];
        $session = $this->session($link, 'asset_context', $data);
        $rows = [];
        foreach ($chunk as $i => $option) {
            $rows[] = [['text' => mb_substr($option['table']->name, 0, 45),
                'callback_data' => 'assettable:'.$session->nonce.':'.$i]];
        }
        $pager = [];
        if ($page > 0) {
            $pager[] = ['text' => 'قبلی', 'callback_data' => 'assetpage:'.$session->nonce.':'.($page - 1)];
        }
        if (($page + 1) * 5 < count($options)) {
            $pager[] = ['text' => 'بعدی', 'callback_data' => 'assetpage:'.$session->nonce.':'.($page + 1)];
        }
        if ($pager) {
            $rows[] = $pager;
        }
        $this->reply($key, $chat, $link,
            '📊 ثبت ردیف جدول'."\n".'جدول مقصد را انتخاب کنید. اطلاعات تا زمان تأیید نهایی ثبت نخواهند شد.',
            $rows, 'asset_tables', null, ['_subject_ids' => $data['tables']]);
    }

    private function start(string $key, string $chat, BaleUserLink $link, DamDataTable $table, ?int $taskId, ?int $department): void
    {
        $columns = app(DamTableRows::class)->schema($table);
        if ($taskId !== null) {
            app(TaskOperations::class)->ownForBale(User::findOrFail($link->user_id), $taskId);
        }
        $session = $this->session($link, 'asset_field', [
            'task_id' => $taskId, 'department_id' => $department,
            'table_id' => $table->id, 'version' => DamTableRows::version($table),
            'index' => 0, 'cells' => [], 'editing' => false,
        ]);
        $this->prompt($key, $chat, $link, $table, $session);
    }

    private function prompt(string $key, string $chat, BaleUserLink $link, DamDataTable $table, BaleConversation $session, string $warning = ''): void
    {
        $d = $session->data;
        $columns = app(DamTableRows::class)->schema($table);
        $idx = (int) $d['index'];
        if (! isset($columns[$idx])) {
            $this->reply($key, $chat, $link, '⚠️ این فیلد در جدول وجود ندارد؛ اطلاعات قبلی حفظ شده‌اند.');

            return;
        }
        $column = $columns[$idx];
        $type = $column['type'] ?? 'text';
        $rows = [];
        if ($type === 'select') {
            foreach (array_slice($column['options'] ?? [], 0, 20) as $i => $option) {
                $rows[] = [['text' => mb_substr((string) $option, 0, 45),
                    'callback_data' => 'assetpick:'.$session->nonce.':'.$i]];
            }
        } elseif ($type === 'boolean') {
            $rows[] = [
                ['text' => 'بله', 'callback_data' => 'assetbool:'.$session->nonce.':1'],
                ['text' => 'خیر', 'callback_data' => 'assetbool:'.$session->nonce.':0'],
            ];
        }
        if (! ($column['required'] ?? false)) {
            $rows[] = [['text' => '⏭ رد کردن این فیلد', 'callback_data' => 'assetskip:'.$session->nonce]];
        }
        if ($idx > 0 && ! ($d['editing'] ?? false)) {
            $rows[] = [['text' => '↩️ فیلد قبلی', 'callback_data' => 'assetback:'.$session->nonce]];
        }
        $hint = match ($type) {
            'date' => 'تاریخ میلادی، نمونه: 2026-10-30',
            'number' => 'عدد وارد کنید.',
            'select' => 'از دکمه‌ها انتخاب کنید یا متن دقیق یکی از گزینه‌ها را بفرستید.',
            'boolean' => 'بله یا خیر را انتخاب کنید.',
            'user' => 'شناسه عددی کاربر فعال',
            'asset' => 'شناسه عددی دارایی قابل مشاهده',
            'link' => 'نشانی معتبر http یا https',
            default => 'متن را در پیام بعدی بفرستید.',
        };
        $current = array_key_exists($column['id'], $d['cells'] ?? [])
            ? "\n".'مقدار فعلی: '.MessageText::plain((string) ($d['cells'][$column['id']] ?? '—'), 90)
            : '';
        $message = ($warning !== '' ? $warning."\n\n" : '')
            .'📝 فیلد '.($idx + 1).' از '.count($columns).' | '.MessageText::plain($table->name, 75)
            ."\n".MessageText::plain($column['name'], 110)
            .($column['required'] ?? false ? ' (اجباری)' : ' (اختیاری)')
            ."\n".$hint.$current;
        $this->reply($key, $chat, $link, $message, $rows, 'asset_table', $table->id, $d);
    }

    private function review(string $key, string $chat, BaleUserLink $link, User $user, DamDataTable $table, BaleConversation $session): void
    {
        $data = $session->data;
        $columns = app(DamTableRows::class)->schema($table);
        // A review must never be offered for missing required answers.
        foreach ($columns as $i => $column) {
            if (! array_key_exists($column['id'], $data['cells'] ?? [])) {
                $data['index'] = $i;
                $session->update(['step' => 'asset_field', 'nonce' => $this->nonce(), 'data' => $data]);
                $this->prompt($key, $chat, $link, $table, $session);

                return;
            }
        }
        app(DamTableRows::class)->validateCells($table, $data['cells'], $user);
        $session->update(['step' => 'asset_confirm', 'nonce' => $this->nonce(), 'data' => $data]);

        $message = '📋 بازبینی ردیف | '.MessageText::plain($table->name, 80)."\n";
        foreach ($columns as $i => $column) {
            $line = ($i + 1).'. '.MessageText::plain($column['name'], 55).': '
                .MessageText::plain((string) ($data['cells'][$column['id']] ?? '—'), 115)."\n";
            if (mb_strlen($message.$line) > 3300) {
                $message .= '… و '.(count($columns) - $i).' ستون دیگر (همه ثبت می‌شوند و قابل ویرایش‌اند).';
                break;
            }
            $message .= $line;
        }
        $message .= "\n".'قبل از ثبت، اطلاعات را بررسی کنید. هیچ ردیفی هنوز ثبت نشده است.';
        $this->reply($key, $chat, $link, $message,
            $this->reviewButtons($columns, $session), 'asset_table', $table->id, $data);
    }

    private function reviewButtons(array $columns, BaleConversation $session): array
    {
        $rows = [[['text' => '✅ تأیید و ثبت ردیف', 'callback_data' => 'confirm:'.$session->nonce]]];
        foreach ($columns as $i => $column) {
            $rows[] = [['text' => '✏️ ویرایش '.mb_substr((string) $column['name'], 0, 32),
                'callback_data' => 'assetedit:'.$session->nonce.':'.$i]];
        }

        return $rows;
    }

    private function firstIncomplete(array $columns, array $cells): int
    {
        foreach ($columns as $i => $column) {
            if (! array_key_exists($column['id'], $cells)) {
                return $i;
            }
        }

        return 0;
    }

    private function remind(string $key, string $chat, BaleUserLink $link, BaleConversation $session): void
    {
        $this->reply($key, $chat, $link,
            'این دکمه مربوط به مرحلهٔ قبلی است. فرم «'.MenuNavigation::label($session).'» همچنان باز است؛ از آخرین پیام استفاده کنید.');
    }

    private function table(User $user, int $id, ?int $department): DamDataTable
    {
        $table = DamDataTable::find($id);
        abort_unless($table, 404);
        $allowed = $department === null
            ? ($user->isActive() && $user->hasPermission('assets.view') && app(DamTableAccess::class)->canEdit($user, $table))
            : app(DamTableAccess::class)->botAllowed($user, $table, $department);
        abort_unless($allowed, 403);

        return $table;
    }

    private function session(BaleUserLink $link, string $step, array $data): BaleConversation
    {
        return BaleConversation::updateOrCreate(['link_id' => $link->id], [
            'step' => $step, 'data' => $data, 'nonce' => $this->nonce(),
            'expires_at' => MenuNavigation::lifetime(),
        ]);
    }

    private function nonce(): string
    {
        return bin2hex(random_bytes(12));
    }

    private function reply(
        string $key, string $chat, BaleUserLink $link, string $body,
        array $buttons = [], ?string $type = null, ?int $id = null, array $meta = []
    ): void {
        $rows = [...$buttons, ...MenuNavigation::rows($link)];
        $rows = [...$rows, ...app(PanelLinks::class)->buttons($link, $type, $id)];
        $payload = [
            'text' => $body,
            'reply_markup' => ['inline_keyboard' => $rows],
        ];
        if ($type === 'asset_tables') {
            $payload['_subject_ids'] = $meta['_subject_ids'] ?? [];
        }
        if ($type === 'asset_table' && isset($meta['department_id']) && is_numeric($meta['department_id'])) {
            $payload['_department_id'] = (int) $meta['department_id'];
        }
        if (! empty($meta['task_id'])) {
            $payload['_task_id'] = (int) $meta['task_id'];
        }
        app(Outbox::class)->enqueue($key, $chat, $payload, $link, $type, $id);
    }
}
