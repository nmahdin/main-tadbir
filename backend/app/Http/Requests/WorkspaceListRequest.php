<?php

namespace App\Http\Requests;

use App\Modules\Tasks\Services\TaskOperations;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Shared bounded list contract; no user-supplied SQL column or direction. */
class WorkspaceListRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $module = $this->segment(3);
        $statuses = match ($module) {
            'projects' => ['planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived', 'open'],
            'tasks' => [...TaskOperations::STATUSES, 'open'],
            default => null, // Content statuses are administrator-configured, not a fixed enum.
        };

        $rules = [
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:120'],
            // UX-02-3 multi-sort: either a legacy single field (with
            // `direction`) or a spec of `field:direction` pairs joined
            // by commas. Fields come from a fixed per-module allowlist,
            // appear at most once, and never reach SQL unsanitized.
            'sort' => ['sometimes', 'string', function (string $attribute, mixed $value, \Closure $fail): void {
                $module = $this->segment(3);
                if (! str_contains($value, ':')) {
                    if (! in_array($value, ['created_at', 'updated_at', 'deadline'], true)) {
                        $fail('فیلد مرتب‌سازی پشتیبانی نمی‌شود.');
                    }

                    return;
                }
                $pairs = explode(',', $value);
                if (count($pairs) > 3) {
                    $fail('حداکثر سه معیار مرتب‌سازی مجاز است.');

                    return;
                }
                $seen = [];
                foreach ($pairs as $pair) {
                    $parts = explode(':', $pair);
                    if (count($parts) !== 2 || ! in_array($parts[0], $this->sortableFields($module), true) || ! in_array($parts[1], ['asc', 'desc'], true)) {
                        $fail('مشخصات مرتب‌سازی معتبر نیست.');

                        return;
                    }
                    if (in_array($parts[0], $seen, true)) {
                        $fail('هر فیلد مرتب‌سازی فقط یک‌بار می‌تواند بیاید.');

                        return;
                    }
                    $seen[] = $parts[0];
                }
            }],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'status' => ['sometimes', 'string', 'max:80', ...($statuses ? [Rule::in($statuses)] : []), ...($module === 'contents' ? [Rule::notIn(['in_progress', 'completed'])] : [])],
            'type' => ['sometimes', 'string', 'max:80'],
            'target_audience' => ['sometimes', 'string', 'max:80'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'content_id' => ['sometimes', 'integer', 'min:1'],
            'project_id' => ['sometimes', 'integer', 'min:1'],
            // Requested workspace context for the Stage 04B Projects
            // pilot; a request input only, never proof of access.
            'workspace_id' => ['sometimes', 'integer', 'min:1'],
            'project_manager_id' => ['sometimes', 'integer', 'min:1'],
            'assignee_id' => ['sometimes', 'integer', 'min:1'],
            'assignee' => ['sometimes', Rule::in(['me'])],
            'owner' => ['sometimes', Rule::in(['me'])],
            'due' => ['sometimes', Rule::in($module === 'tasks' ? ['today', 'near', 'overdue'] : ['today', 'overdue'])],
            // UX-02-3 export (projects only): comma-separated export
            // columns from a fixed allowlist; anything else is 422.
            'columns' => ['sometimes', 'string', 'max:200', function (string $attribute, mixed $value, \Closure $fail): void {
                $columns = array_filter(array_map('trim', explode(',', $value)));
                if ($columns === [] || array_diff($columns, self::EXPORTABLE_PROJECT_COLUMNS) !== []) {
                    $fail('ستون خروجی پشتیبانی نمی‌شود.');
                }
            }],
        ];
        $scopes = [
            'content_id' => ['tasks'], 'type' => ['contents'], 'target_audience' => ['contents'], 'priority' => ['projects', 'tasks'], 'project_id' => ['tasks', 'contents'], 'workspace_id' => ['projects'],
            'project_manager_id' => ['projects'], 'assignee_id' => ['tasks'],
            'assignee' => ['tasks'], 'owner' => ['contents'], 'due' => ['tasks', 'projects'],
            'columns' => ['projects'],
        ];
        foreach ($scopes as $key => $modules) {
            if (! in_array($module, $modules, true)) {
                $rules[$key] = ['prohibited'];
            }
        }

        return $rules;
    }

    /** Exportable project columns (labels live in the controller). */
    public const EXPORTABLE_PROJECT_COLUMNS = ['name', 'status', 'priority', 'deadline', 'project_manager', 'progress', 'created_at', 'updated_at'];

    /**
     * Validated export columns in request order (defaults: all).
     *
     * @return list<string>
     */
    public function exportColumns(): array
    {
        $columns = array_values(array_filter(array_map('trim', explode(',', $this->string('columns')->toString()))));

        return $columns === [] ? self::EXPORTABLE_PROJECT_COLUMNS : $columns;
    }

    /**
     * Sortable fields per module — the only columns a client may ever
     * name. Anything else is rejected during validation, so the spec
     * can be applied to the query builder without SQL injection risk.
     *
     * @return list<string>
     */
    public function sortableFields(?string $module = null): array
    {
        $module ??= $this->segment(3);
        $base = ['created_at', 'updated_at', 'deadline'];

        return in_array($module, ['projects', 'tasks'], true) ? [...$base, 'priority'] : $base;
    }

    /**
     * Normalized, validated sort specification in precedence order.
     * Legacy `sort` + `direction` requests map to a single-entry spec;
     * controllers append a stable `id` tiebreaker themselves.
     *
     * @return list<array{field: string, direction: string}>
     */
    public function sortSpec(): array
    {
        $sort = $this->string('sort')->toString();
        if ($sort === '') {
            return [['field' => 'created_at', 'direction' => 'desc']];
        }
        if (! str_contains($sort, ':')) {
            return [['field' => $sort, 'direction' => $this->string('direction')->toString() ?: 'desc']];
        }

        return array_map(static function (string $pair): array {
            [$field, $direction] = explode(':', $pair);

            return ['field' => $field, 'direction' => $direction];
        }, explode(',', $sort));
    }

    public function after(): array
    {
        return [function ($validator) {
            foreach (array_diff(array_keys($this->query()), array_keys($this->rules())) as $key) {
                $validator->errors()->add($key, 'این فیلتر پشتیبانی نمی‌شود.');
            }
        }];
    }
}
