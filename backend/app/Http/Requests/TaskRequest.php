<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'title' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'contentId' => ['sometimes', 'nullable', 'integer', 'exists:contents,id'],
            'contentStageId' => ['sometimes', 'nullable', 'string', 'max:120'],
            'kind' => ['sometimes', Rule::in(['general', 'content_work', 'content_review'])],
            'assigneeId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'status' => ['sometimes', Rule::in(['backlog', 'todo', 'in_progress', 'review', 'completed'])],
            'startDate' => ['sometimes', 'nullable', 'date'],
            'deadline' => ['sometimes', 'nullable', 'date', 'after_or_equal:startDate'],
            'estimatedHours' => ['sometimes', 'integer', 'min:0'],
            'loggedHours' => ['sometimes', 'integer', 'min:0'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string', 'max:80'],
            'dependencies' => ['sometimes', 'array'],
            'dependencies.*' => ['integer', 'distinct', 'exists:tasks,id'],
            'isBlocked' => ['sometimes', 'boolean'],
            'blockedReason' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
