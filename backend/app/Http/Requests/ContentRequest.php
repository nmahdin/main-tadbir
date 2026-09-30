<?php

namespace App\Http\Requests;

use App\Services\ContentReview;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ContentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'reviewVersion' => ['sometimes', 'string', 'size:64'],
            'stages' => ['sometimes', 'array', 'list', 'max:100'],
            'stages.*.id' => ['required', 'string', 'max:120', 'distinct'],
            'stages.*.status' => ['sometimes', 'string', Rule::in(ContentReview::STATUSES)],
            'title' => [$required, 'string', 'max:255'],
            'type' => [$required, 'string', 'max:80'],
            'status' => ['sometimes', 'string', 'max:80'],
            'deadline' => ['sometimes', 'nullable', 'date'],
            'ownerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'projectId' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
        ];
    }
}
