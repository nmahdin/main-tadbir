<?php

namespace App\Services;

use App\Models\Content;
use App\Models\DamDataRow;
use App\Models\DamDataRowActivity;
use App\Models\DamAsset;
use App\Models\DamDataTable;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class DamTableRows
{
    public function schema(DamDataTable $table): array
    {
        $columns = $table->columns ?? [];
        abort_unless(is_array($columns) && count($columns) > 0 && count($columns) <= 100, 422, 'تعریف ستون‌های جدول کامل نیست.');
        $ids = [];
        foreach ($columns as $column) {
            abort_unless(is_array($column) && preg_match('/^[A-Za-z0-9_-]{1,60}$/', (string) ($column['id'] ?? '')) && ! in_array($column['id'], $ids, true), 422, 'شناسه ستون نامعتبر است.');
            abort_unless(in_array($column['type'] ?? 'text', [
                'text', 'long_text', 'number', 'date', 'select', 'boolean', 'link', 'user', 'asset',
            ], true), 422, 'نوع ستون پشتیبانی نمی‌شود.');
            $ids[] = $column['id'];
        }

        return $columns;
    }

    public function rules(array $column): array
    {
        $rules = [($column['required'] ?? false) ? 'required' : 'nullable'];

        return [...$rules, ...match ($column['type'] ?? 'text') {
            'number' => ['numeric'],
            'date' => ['date_format:Y-m-d'],
            'select' => ['string', Rule::in($column['options'] ?? [])],
            'boolean' => ['boolean'],
            'link' => ['url:http,https', 'max:2048'],
            'user', 'asset' => ['integer', 'min:1'],
            'long_text' => ['string', 'max:20000'],
            default => ['string', 'max:'.max(1, min(3000, (int) ($column['max_length'] ?? 3000)))],
        }];
    }

    public function validateCells(DamDataTable $table, array $cells, ?User $actor = null): array
    {
        $columns = $this->schema($table);
        if (array_diff(array_keys($cells), array_column($columns, 'id'))) {
            throw ValidationException::withMessages(['cells' => 'فیلد ناشناخته در جدول مجاز نیست.']);
        }
        $rules = [];
        foreach ($columns as $column) {
            $rules['cells.'.$column['id']] = $this->rules($column);
        }
        Validator::make(['cells' => $cells], $rules)->validate();

        if ($actor) {
            foreach ($columns as $column) {
                $value = $cells[$column['id']] ?? null;
                if ($value === null || $value === '') {
                    continue;
                }
                if (($column['type'] ?? 'text') === 'asset') {
                    $asset = DamAsset::query()->find((int) $value);
                    // One generic validation response prevents probing private
                    // asset IDs through a structured-data cell.
                    if (! $asset || ! app(DamAssetAccess::class)->canView($actor, $asset)) {
                        throw ValidationException::withMessages(['cells.'.$column['id'] => 'دارایی انتخابی در دسترس نیست.']);
                    }
                }
                if (($column['type'] ?? 'text') === 'user'
                    && ! User::query()->whereKey((int) $value)->where('status', 'active')->exists()) {
                    throw ValidationException::withMessages(['cells.'.$column['id'] => 'کاربر انتخابی معتبر نیست.']);
                }
            }
        }

        return $cells;
    }

    public static function version(DamDataTable $table): string
    {
        return hash('sha256', json_encode($table->columns));
    }

    public function create(User $actor, DamDataTable $table, array $data, ?int $departmentId = null, ?string $version = null): DamDataRow
    {
        return DB::transaction(function () use ($actor, $table, $data, $departmentId, $version) {
            $actor = $actor->fresh();
            $table = DamDataTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $access = app(DamTableAccess::class);
            abort_unless($actor && $access->canEdit($actor, $table), 403);
            if ($departmentId !== null) {
                abort_unless($access->botAllowed($actor, $table, $departmentId), 403);
                abort_unless($version && hash_equals(self::version($table), $version), 409, 'تعریف فرم تغییر کرده است؛ دوباره شروع کنید.');
            }
            $cells = $this->validateCells($table, $data['cells'] ?? [], $actor);
            if (! empty($data['task_id'])) {
                $task = app(TaskOperations::class)->visibleTo($actor)->whereKey($data['task_id'])->lockForUpdate()->first();
                abort_unless($task && ($departmentId === null || (int) $task->assignee_id === (int) $actor->id), 403);
            }
            if (! empty($data['content_id'])) {
                abort_unless(app(ContentAccess::class)->canView($actor, Content::findOrFail($data['content_id'])), 403);
            }
            $row = $table->rows()->create([
                'cells' => $cells, 'position' => $data['position'] ?? ((int) $table->rows()->max('position') + 1),
                'created_by' => $actor->id, 'updated_by' => $actor->id,
                'task_id' => $data['task_id'] ?? null, 'content_id' => $data['content_id'] ?? null,
            ]);
            DamDataRowActivity::create(['table_id' => $table->id, 'row_id' => $row->id, 'actor_id' => $actor->id,
                'action' => 'created', 'metadata' => [
                    'source' => $departmentId === null ? 'web' : 'bale',
                    'department_id' => $departmentId,
                    'columns' => array_keys($cells),
                    'changes' => collect($cells)->map(fn ($value, $columnId) => [
                        'column_id' => (string) $columnId, 'from' => null, 'to' => $value,
                    ])->values()->all(),
                ]]);
            $table->touch();

            return $row;
        });
    }
}
