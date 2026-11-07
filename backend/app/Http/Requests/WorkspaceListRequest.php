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

    /**
     * پارامترهای بی‌مقدار پیش از اعتبارسنجی حذف می‌شوند.
     *
     * رابطِ وب نسخهٔ قدیمی، کلیدهای خالی را هم به نشانی می‌فرستاد
     * (`direction=undefined`) و سرور آن را «مقدار انتخاب‌شده برای direction
     * معتبر نیست» رد می‌کرد؛ نتیجه، شکستِ بارگذاریِ فهرست وظایف بود. حالا این
     * کلیدها نادیده گرفته می‌شوند و مقدار پیش‌فرض اعمال می‌گردد، پس نسخهٔ
     * کش‌شدهٔ رابط هم بدون خطا کار می‌کند.
     */
    protected function prepareForValidation(): void
    {
        $query = [];
        foreach ($this->query() as $key => $value) {
            // middleware پیش‌فرض رشتهٔ خالی را به null تبدیل می‌کند؛ هر دو حالت
            // «بدون مقدار» شمرده می‌شوند.
            if ($value === null || $value === ''
                || (is_string($value) && in_array(strtolower(trim($value)), ['undefined', 'null', 'nan'], true))) {
                continue;
            }
            $query[$key] = $value;
        }
        $this->query->replace($query);
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
            // Only the main content workspace hides published/archived. Other consumers stay unchanged.
            'active_only' => ['sometimes', Rule::in(['1'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:120'],
            // ستون‌های مرتب‌سازی همان ستون‌های واقعی جدول‌اند؛ فقط فهرست محتوا
            // «تاریخ انتشار» را هم می‌پذیرد که از payload خودِ پرونده خوانده
            // می‌شود (نه ستون تازه).
            'sort' => ['sometimes', Rule::in($module === 'contents'
                ? ['created_at', 'updated_at', 'deadline', 'publish_at']
                : ['created_at', 'updated_at', 'deadline'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'status' => ['sometimes', 'string', 'max:80', ...($statuses ? [Rule::in($statuses)] : []), ...($module === 'contents' ? [Rule::notIn(['in_progress', 'completed'])] : [])],
            'type' => ['sometimes', 'string', 'max:80'],
            'target_audience' => ['sometimes', 'string', 'max:80'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'content_id' => ['sometimes', 'integer', 'min:1'],
            // تفکیک وظایف متصل به محتوا از وظایف مستقل (کارتابل من).
            'linked' => ['sometimes', Rule::in(['content', 'none'])],
            'project_id' => ['sometimes', 'integer', 'min:1'],
            'project_manager_id' => ['sometimes', 'integer', 'min:1'],
            'assignee_id' => ['sometimes', 'integer', 'min:1'],
            'assignee' => ['sometimes', Rule::in(['me'])],
            'owner' => ['sometimes', Rule::in(['me'])],
            'due' => ['sometimes', Rule::in($module === 'tasks' ? ['today', 'near', 'overdue'] : ['today', 'overdue'])],
        ];
        $scopes = [
            'content_id' => ['tasks'], 'linked' => ['tasks'], 'type' => ['contents'], 'target_audience' => ['contents'], 'priority' => ['projects', 'tasks'], 'project_id' => ['tasks', 'contents'],
            'project_manager_id' => ['projects'], 'assignee_id' => ['tasks'],
            'assignee' => ['tasks'], 'owner' => ['contents'], 'due' => ['tasks', 'projects'],
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
            foreach (array_diff(array_keys($this->query()), array_keys($this->rules())) as $key) {
                $validator->errors()->add($key, 'این فیلتر پشتیبانی نمی‌شود.');
            }
        }];
    }
}
