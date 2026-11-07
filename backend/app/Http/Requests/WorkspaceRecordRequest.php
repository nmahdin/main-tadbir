<?php

namespace App\Http\Requests;

use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkspaceRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if (! $this->filled('title') && $this->filled('subject')) {
            $this->merge(['title' => $this->input('subject')]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        $kind = (string) $this->route('kind');
        $meeting = $kind === WorkspaceRecord::KIND_MEETING;
        $idea = $kind === WorkspaceRecord::KIND_IDEA;

        return [
            ...($idea || $meeting ? ['projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id']] : []),
            ...($idea ? ['category' => ['sometimes', 'nullable', 'string', 'max:80']] : []),
            ...($meeting ? [
                'actionItems' => ['sometimes', 'array', 'max:200'],
                'actionItems.*.id' => ['required', 'string', 'max:100', 'distinct'],
                'actionItems.*.title' => ['required', 'string', 'max:255'],
                'actionItems.*.assigneeId' => ['required', 'integer', 'exists:users,id'],
                'actionItems.*.deadline' => ['nullable', 'string', 'max:50'],
                'organizerId' => ['sometimes', 'integer', 'exists:users,id'],
                'attendeeIds' => ['sometimes', 'array', 'max:200'],
                'attendeeIds.*' => ['integer', 'distinct', 'exists:users,id'],
                'date' => ['sometimes', 'string', 'max:50'],
                'time' => ['sometimes', 'string', 'max:20'],
                'duration' => ['sometimes', 'nullable', 'string', 'max:80'],
                // ساعت شروع/پایان واقعی جلسه در صورت‌جلسه ثبت می‌شود و در payload
                // همان رکورد می‌ماند؛ قالب سخت‌گیرانه گرفته نمی‌شود تا ارقام
                // فارسی و ساعت تک‌رقمی هم پذیرفته شوند.
                'startTime' => ['sometimes', 'nullable', 'string', 'max:10', 'regex:/^[0-9۰-۹]{1,2}:[0-9۰-۹]{2}$/u'],
                'endTime' => ['sometimes', 'nullable', 'string', 'max:10', 'regex:/^[0-9۰-۹]{1,2}:[0-9۰-۹]{2}$/u'],
                // مهمان‌ها کاربر سامانه نیستند؛ فقط نام آن‌ها نگه داشته می‌شود.
                'guests' => ['sometimes', 'array', 'max:50'],
                'guests.*' => ['string', 'max:120'],
                'locationType' => ['sometimes', 'nullable', Rule::in(['in_person', 'online', 'hybrid'])],
                'locationDetails' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'archivedFromStatus' => ['sometimes', 'nullable', Rule::in(['scheduled', 'in_progress', 'completed', 'cancelled'])],
            ] : []),
            'title' => [$required, 'string', 'max:255'],
            'clientRequestId' => ['sometimes', 'uuid'],
            'status' => [
                'sometimes',
                'nullable',
                $idea
                    ? Rule::in(['draft', 'submitted', 'under_review', 'needs_info', 'approved', 'rejected', 'in_progress', 'implemented', 'completed', 'archived'])
                    : ($meeting ? Rule::in(['scheduled', 'in_progress', 'completed', 'cancelled', 'archived']) : 'string'),
                'max:80',
            ],
        ];
    }
}
