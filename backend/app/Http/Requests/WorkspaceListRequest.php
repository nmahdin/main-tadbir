<?php

namespace App\Http\Requests;

use App\Services\TaskOperations;
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
            'sort' => ['sometimes', Rule::in(['created_at', 'updated_at', 'deadline'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'status' => ['sometimes', 'string', 'max:80', ...($statuses ? [Rule::in($statuses)] : []), ...($module === 'contents' ? [Rule::notIn(['in_progress', 'completed'])] : [])],
            'type' => ['sometimes', 'string', 'max:80'],
            'target_audience' => ['sometimes', 'string', 'max:80'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'content_id' => ['sometimes', 'integer', 'min:1'],
            'project_id' => ['sometimes', 'integer', 'min:1'],
            'project_manager_id' => ['sometimes', 'integer', 'min:1'],
            'assignee_id' => ['sometimes', 'integer', 'min:1'],
            'assignee' => ['sometimes', Rule::in(['me'])],
            'owner' => ['sometimes', Rule::in(['me'])],
            'due' => ['sometimes', Rule::in(['today', 'overdue'])],
            'publish_from' => ['sometimes', 'date_format:Y-m-d'],
            'publish_to' => ['sometimes', 'date_format:Y-m-d'],
        ];
        $scopes = [
            'content_id' => ['tasks'], 'type' => ['contents'], 'target_audience' => ['contents'], 'priority' => ['projects', 'tasks'], 'project_id' => ['tasks', 'contents'],
            'project_manager_id' => ['projects'], 'assignee_id' => ['tasks'],
            'assignee' => ['tasks'], 'owner' => ['contents'], 'due' => ['tasks', 'projects'], 'publish_from' => ['contents'], 'publish_to' => ['contents'],
        ];
        foreach ($scopes as $key => $modules) {
            if (! in_array($module, $modules, true)) {
                $rules[$key] = ['prohibited'];
            }
        }

        return $rules;
    }

    public function after(): array
    {
        return [function ($validator) {
            if ($this->filled('publish_from') && $this->filled('publish_to')
                && $this->string('publish_to')->toString() < $this->string('publish_from')->toString()) {
                $validator->errors()->add('publish_to', 'تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد.');
            }
            foreach (array_diff(array_keys($this->query()), array_keys($this->rules())) as $key) {
                $validator->errors()->add($key, 'این فیلتر پشتیبانی نمی‌شود.');
            }
        }];
    }
}
