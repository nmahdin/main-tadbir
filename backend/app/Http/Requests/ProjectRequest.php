<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProjectRequest extends FormRequest
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
            'name' => [$required, 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'projectManagerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'memberIds' => ['sometimes', 'array'],
            'memberIds.*' => ['integer', 'distinct', 'exists:users,id'],
            'startDate' => ['sometimes', 'nullable', 'date'],
            'deadline' => ['sometimes', 'nullable', 'date', 'after_or_equal:startDate'],
            'status' => ['sometimes', Rule::in(['planning', 'active', 'on_hold', 'completed', 'cancelled', 'archived'])],
            'progress' => ['sometimes', 'integer', 'between:0,100'],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string', 'max:80'],
            'color' => ['sometimes', 'string', 'max:20'],
            'budget' => ['sometimes', 'nullable', 'string', 'max:255'],
            'category' => ['sometimes', 'nullable', 'string', 'max:120'],
            'templateId' => ['sometimes', 'nullable', 'integer', 'exists:project_templates,id'],
        ];
    }
}
