<?php

namespace App\Bot\Bale\Handlers;

use App\Bot\Bale\Support\MenuNavigation;
use App\Bot\Bale\Support\MessageText;
use App\Models\BaleConversation;
use App\Models\BaleUserLink;
use App\Models\DamDataTable;
use App\Models\User;
use App\Services\DamTableAccess;
use App\Services\DamTableRows;
use App\Services\TaskOperations;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * The one and only state machine for Bale table-row entry.
 *
 * Each inbound update produces exactly one prompt. The encrypted conversation
 * and the matching encrypted outbox checkpoint are committed atomically by the
 * existing UpdateProcessor transaction. No row is written until nonce-confirm.
 */
final class TableRowWizard
{
    public function start(
        BaleUserLink $link, User $user, DamDataTable $table, ?int $departmentId,
        ?int $taskId, \Closure $send
    ): void {
        $this->authorize($user, $table, $departmentId);
        app(DamTableRows::class)->schema($table);
        $session = BaleConversation::updateOrCreate(['link_id' => $link->id], [
            'step' => 'asset_field',
            'nonce' => bin2hex(random_bytes(12)),
            'data' => [
                'table_id' => $table->id, 'department_id' => $departmentId,
                'task_id' => $taskId, 'version' => DamTableRows::version($table),
                'index' => 0, 'cells' => [],
            ],
            'expires_at' => MenuNavigation::lifetime(),
        ]);
        $this->prompt($table, $session, $send);
    }

    public function handle(
        User $user, BaleConversation $session, string $action, ?string $text, \Closure $send
    ): bool {
        if (! in_array($session->step, ['asset_field', 'asset_confirm'], true)) {
            return false;
        }

        $data = $session->data;
        $table = DamDataTable::find($data['table_id'] ?? null);
        abort_unless($table, 404, 'جدول اطلاعات دیگر در دسترس نیست.');
        $departmentId = is_numeric($data['department_id'] ?? null) ? (int) $data['department_id'] : null;
        $this->authorize($user, $table, $departmentId);
        if (! empty($data['task_id'])) {
            app(TaskOperations::class)->ownForBale($user, (int) $data['task_id']);
        }

        $rows = app(DamTableRows::class);
        $columns = $rows->schema($table);

        // A schema edit never consumes the user's answer against an old field.
        // A single refreshed prompt is generated, not two messages sharing a
        // deduplication key (which used to discard the actual new question).
        if (! hash_equals((string) ($data['version'] ?? ''), DamTableRows::version($table))) {
            $old = is_array($data['cells'] ?? null) ? $data['cells'] : [];
            $retained = [];
            foreach ($columns as $index => $column) {
                if (! array_key_exists($column['id'], $old)) {
                    continue;
                }
                try {
                    Validator::make(['value' => $old[$column['id']]], [
                        'value' => $rows->rules($column),
                    ])->validate();
                    $retained[$column['id']] = $old[$column['id']];
                } catch (ValidationException) {
                    // This value is no longer valid under the updated schema.
                }
            }
            $data['cells'] = $retained;
            $data['version'] = DamTableRows::version($table);
            $data['index'] = min(max(0, (int) ($data['index'] ?? 0)), count($columns) - 1);
            foreach ($columns as $index => $column) {
                if (($column['required'] ?? false) && ! isset($retained[$column['id']])) {
                    $data['index'] = min($data['index'], $index);
                    break;
                }
            }
            unset($data['resume_confirm']);
            $this->save($session, 'asset_field', $data);
            $this->prompt($table, $session, $send,
                '⚠️ تعریف جدول تغییر کرده است. مقادیر سازگار حفظ شده‌اند؛ این فیلد را دوباره بررسی کنید.');

            return true;
        }

        if ($session->step === 'asset_confirm') {
            if (preg_match('/^assetedit:([a-f0-9]{24}):([0-9]{1,3})$/D', $action, $m)
                && hash_equals($session->nonce, $m[1])) {
                $index = (int) $m[2];
                abort_unless(isset($columns[$index]), 409, 'فیلد انتخاب‌شده معتبر نیست.');
                $data['index'] = $index;
                $data['resume_confirm'] = true;
                $this->save($session, 'asset_field', $data);
                $this->prompt($table, $session, $send);

                return true;
            }
            if (preg_match('/^confirm:([a-f0-9]{24})$/D', $action, $m)) {
                abort_unless(hash_equals($session->nonce, $m[1]), 409);
                // Always recheck the schema, permission and all fields at commit.
                $row = $rows->create($user, $table, [
                    'cells' => $data['cells'],
                    'task_id' => $data['task_id'] ?? null,
                ], $departmentId, (string) $data['version']);
                $session->delete();
                $send('✅ ردیف شماره '.$row->id.' در جدول «'.MessageText::plain($table->name, 100).'» ثبت شد.',
                    [], 'asset_table', $table->id, $this->meta($data));

                return true;
            }

            return false;
        }

        if (preg_match('/^assetback:([a-f0-9]{24})$/D', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1]), 409);
            $data['index'] = max(0, (int) $data['index'] - 1);
            unset($data['resume_confirm']);
            $this->save($session, 'asset_field', $data);
            $this->prompt($table, $session, $send);

            return true;
        }

        $index = (int) ($data['index'] ?? -1);
        abort_unless(isset($columns[$index]), 409, 'مرحلهٔ فرم معتبر نیست؛ دوباره جدول را انتخاب کنید.');
        $column = $columns[$index];

        $value = null;
        if (preg_match('/^assetpick:([a-f0-9]{24}):([0-9]{1,3})$/D', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1])
                && ($column['type'] ?? '') === 'select'
                && isset($column['options'][(int) $m[2]]), 409);
            $value = $column['options'][(int) $m[2]];
        } elseif (preg_match('/^assetskip:([a-f0-9]{24})$/D', $action, $m)) {
            abort_unless(hash_equals($session->nonce, $m[1])
                && ! ($column['required'] ?? false), 409);
        } elseif ($text !== null) {
            // A lone dash retains the existing convention for empty optional
            // values; all other text (including Persian/Arabic) is literal.
            $value = ($text === '-' && ! ($column['required'] ?? false)) ? null : $text;
        } else {
            return false;
        }

        try {
            Validator::make(['value' => $value], ['value' => $rows->rules($column)])->validate();
        } catch (ValidationException $error) {
            $reason = collect($error->errors())->flatten()->first();
            $this->prompt($table, $session, $send,
                '⚠️ '.MessageText::plain((string) $reason, 250).' لطفاً پاسخ همین فیلد را اصلاح کنید.');

            return true;
        }
        $data['cells'][$column['id']] = $value;
        if (! empty($data['resume_confirm'])) {
            unset($data['resume_confirm']);
            $this->save($session, 'asset_confirm', $data);
            $this->preview($table, $session, $columns, $send);

            return true;
        }

        $data['index'] = $index + 1;
        if ($data['index'] < count($columns)) {
            $this->save($session, 'asset_field', $data);
            $this->prompt($table, $session, $send);
        } else {
            try {
                $rows->validateCells($table, $data['cells'], $user);
            } catch (ValidationException $error) {
                $reason = collect($error->errors())->flatten()->first();
                $data['index'] = count($columns) - 1;
                $this->save($session, 'asset_field', $data);
                $this->prompt($table, $session, $send,
                    '⚠️ '.MessageText::plain((string) $reason, 250).' اطلاعات را بررسی کنید.');

                return true;
            }
            $this->save($session, 'asset_confirm', $data);
            $this->preview($table, $session, $columns, $send);
        }

        return true;
    }

    private function prompt(DamDataTable $table, BaleConversation $session, \Closure $send, string $notice = ''): void
    {
        $data = $session->data;
        $columns = app(DamTableRows::class)->schema($table);
        $index = (int) $data['index'];
        $column = $columns[$index];
        $type = $column['type'] ?? 'text';
        $rows = [];
        if ($type === 'select') {
            foreach (array_slice($column['options'] ?? [], 0, 20) as $i => $option) {
                $rows[] = [[
                    'text' => mb_substr((string) $option, 0, 50),
                    'callback_data' => 'assetpick:'.$session->nonce.':'.$i,
                ]];
            }
        }
        if (! ($column['required'] ?? false)) {
            $rows[] = [['text' => '⏭ رد کردن فیلد اختیاری',
                'callback_data' => 'assetskip:'.$session->nonce]];
        }
        if ($index > 0 && empty($data['resume_confirm'])) {
            $rows[] = [['text' => '⬅️ فیلد قبلی',
                'callback_data' => 'assetback:'.$session->nonce]];
        }
        $hint = match ($type) {
            'date' => 'تاریخ میلادی YYYY-MM-DD',
            'number' => 'عدد (مثل 123 یا ۱۲۳)',
            'select' => 'یکی از دکمه‌ها یا متن دقیق گزینه',
            'boolean' => '0 یا 1',
            'link' => 'نشانی اینترنتی معتبر',
            'user', 'asset' => 'شناسه عددی معتبر',
            default => 'پاسخ متنی',
        };
        $prior = array_key_exists($column['id'], $data['cells'] ?? [])
            ? "\n✏️ مقدار قبلی: ".MessageText::plain((string) ($data['cells'][$column['id']] ?? 'خالی'), 150)
            : '';
        $body = ($notice !== '' ? $notice."\n\n" : '')
            .'📋 ثبت ردیف در «'.MessageText::plain($table->name, 100).'»'
            ."\n".'فیلد '.($index + 1).' از '.count($columns).': '.MessageText::plain((string) $column['name'], 100)
            ."\n".$hint.' — '.(($column['required'] ?? false) ? 'اجباری' : 'اختیاری؛ «-» یعنی خالی')
            .$prior."\n\n".'پاسخ همین فیلد را ارسال کنید. برای انصراف /cancel را بفرستید.';
        $send($body, $rows, 'asset_table', $table->id, $this->meta($data));
    }

    private function preview(DamDataTable $table, BaleConversation $session, array $columns, \Closure $send): void
    {
        $data = $session->data;
        $body = '✅ پیش‌نمایش ثبت در «'.MessageText::plain($table->name, 100)."»\n";
        $shown = 0;
        foreach ($columns as $index => $column) {
            $value = (string) ($data['cells'][$column['id']] ?? '—');
            $line = "\n".($index + 1).'. '.MessageText::plain((string) $column['name'], 60)
                .': '.MessageText::plain($value, 120);
            if (mb_strlen($body.$line) > 3200) {
                $body .= "\n… و ".(count($columns) - $shown).' ستون دیگر (همه ثبت می‌شوند).';
                break;
            }
            $body .= $line;
            $shown++;
        }
        $body .= "\n\n".'پس از بررسی، «تأیید ثبت» را بزنید. تا قبل از تأیید هیچ ردیفی ساخته نمی‌شود.';
        $buttons = [[['text' => '✅ تأیید ثبت', 'callback_data' => 'confirm:'.$session->nonce]]];
        // Do not produce hundreds of buttons for large schemas.
        foreach (array_slice($columns, 0, 20) as $index => $column) {
            $buttons[] = [[
                'text' => '✏️ ویرایش '.MessageText::plain((string) $column['name'], 32),
                'callback_data' => 'assetedit:'.$session->nonce.':'.$index,
            ]];
        }
        $send($body, $buttons, 'asset_table', $table->id, $this->meta($data));
    }

    private function save(BaleConversation $session, string $step, array $data): void
    {
        $session->update([
            'step' => $step, 'data' => $data,
            'nonce' => bin2hex(random_bytes(12)),
            'expires_at' => MenuNavigation::lifetime(),
        ]);
        $session->refresh();
    }

    private function authorize(User $user, DamDataTable $table, ?int $departmentId): void
    {
        $access = app(DamTableAccess::class);
        abort_unless($user->isActive() && $user->hasPermission('assets.view')
            && ($departmentId === null
                ? $access->canEdit($user, $table)
                : $access->botAllowed($user, $table, $departmentId)), 403);
    }

    private function meta(array $data): array
    {
        return is_numeric($data['department_id'] ?? null)
            ? ['_department_id' => (int) $data['department_id']]
            : [];
    }
}
