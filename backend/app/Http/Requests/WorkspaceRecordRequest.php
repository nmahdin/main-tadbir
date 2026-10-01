<?php

namespace App\Http\Requests;

use App\Models\WorkspaceRecord;
use Illuminate\Foundation\Http\FormRequest;

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
                'locationDetails' => ['sometimes', 'nullable', 'string', 'max:1000'],
            ] : []),
            'title' => [$required, 'string', 'max:255'],
            'status' => ['sometimes', 'nullable', 'string', 'max:80'],
        ];
    }
}
